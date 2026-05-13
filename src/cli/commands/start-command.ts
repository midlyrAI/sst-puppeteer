import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { IpcClient } from '../../session/ipc-client.js';
import {
  spawnDaemon as defaultSpawnDaemon,
  type SpawnDaemonOpts,
  type SpawnDaemonResult,
} from '../../session/spawn.js';
import { EXIT_OK, EXIT_RUNTIME } from '../output/exit-codes.js';
import { formatOutput } from '../output/formatter.js';
import { cleanupStaleSession, probeLiveness, tryReadMeta, writeMeta } from '../../session/meta.js';
import {
  allSessionDirs,
  lockDir,
  locksRoot,
  sessionDir,
  socketPath as socketPathFn,
} from '../../session/paths.js';
import { Command, type CliContext, type HelpSchema } from './command.js';

export type SpawnDaemonFn = (opts: SpawnDaemonOpts) => Promise<SpawnDaemonResult>;

const dedupKey = (projectDir: string, stage: string): string =>
  crypto.createHash('sha256').update(`${projectDir}:${stage}`).digest('hex').slice(0, 12);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Walk up from projectDir collecting every existing `node_modules/.bin`
 * directory until the filesystem root. Mirrors npm/pnpm shell-script behavior
 * so locally-installed binaries like `sst` resolve inside the daemon's PTY.
 */
export const collectNodeModulesBins = (projectDir: string): string[] => {
  const bins: string[] = [];
  let dir = path.resolve(projectDir);
  while (true) {
    const candidate = path.join(dir, 'node_modules', '.bin');
    try {
      if (fs.statSync(candidate).isDirectory()) bins.push(candidate);
    } catch {
      // not present at this level
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return bins;
};

const augmentPath = (projectDir: string, basePath: string | undefined): string => {
  const bins = collectNodeModulesBins(projectDir);
  const parts = [...bins];
  if (basePath !== undefined && basePath.length > 0) parts.push(basePath);
  return parts.join(path.delimiter);
};

export class StartCommand extends Command {
  readonly name = 'start';
  readonly description = 'Spawn a session daemon for a project + stage.';

  constructor(private readonly _spawnDaemon: SpawnDaemonFn = defaultSpawnDaemon) {
    super();
  }

  override helpSchema(): HelpSchema {
    return {
      input: z.object({
        projectDir: z.string(),
        stage: z.string().optional(),
        'no-wait': z.boolean().optional(),
        'aws-profile': z.string().optional(),
        'aws-region': z.string().optional(),
        pretty: z.boolean().optional(),
      }),
      output: z.object({
        sessionId: z.string(),
        projectDir: z.string(),
        stage: z.string(),
        status: z.enum(['ready', 'started']),
      }),
    };
  }

  override async execute(args: readonly string[], ctx: CliContext): Promise<number> {
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: [...args],
        options: {
          stage: { type: 'string' },
          'no-wait': { type: 'boolean', default: false },
          'aws-profile': { type: 'string' },
          'aws-region': { type: 'string' },
          pretty: { type: 'boolean', default: false },
          help: { type: 'boolean', default: false },
          'help-json': { type: 'boolean', default: false },
        },
        allowPositionals: true,
        strict: true,
      });
    } catch (err) {
      ctx.stderr.write(JSON.stringify({ error: (err as Error).message }) + '\n');
      return 2;
    }

    if (parsed.values['help-json'] === true) {
      const schema = this.helpSchema();
      ctx.stdout.write(
        JSON.stringify({
          name: this.name,
          description: this.description,
          input: schema.input._def,
          output: schema.output._def,
        }) + '\n',
      );
      return 0;
    }
    if (parsed.values['help'] === true) {
      ctx.stdout.write(
        [
          'Usage: sst-puppeteer start <projectDir> [--stage S] [--no-wait] [--aws-profile P] [--aws-region R]',
          '',
          'Spawn a session daemon for a project + stage. By default waits until the SST dev',
          'server reports ready before returning. Use --no-wait to return immediately after fork.',
          '',
          'Example:',
          '  sst-puppeteer start ./my-app --stage dev',
          '  sst-puppeteer start ./my-app --stage prod --no-wait',
        ].join('\n') + '\n',
      );
      return 0;
    }

    const projectArg = parsed.positionals[0];
    if (projectArg === undefined) {
      ctx.stderr.write(JSON.stringify({ error: 'projectDir is required' }) + '\n');
      return 2;
    }
    const projectDir = path.resolve(ctx.cwd, projectArg);
    const stage = (parsed.values['stage'] as string | undefined) ?? 'default';
    const noWait = parsed.values['no-wait'] === true;
    const pretty = parsed.values['pretty'] === true;
    const awsProfile = parsed.values['aws-profile'] as string | undefined;
    const awsRegion = parsed.values['aws-region'] as string | undefined;

    const key = dedupKey(projectDir, stage);
    const lockPath = lockDir(key);

    // Step 2: lock
    fs.mkdirSync(locksRoot(), { recursive: true });
    let lockAcquired = false;
    try {
      fs.mkdirSync(lockPath, { recursive: false });
      lockAcquired = true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        // re-scan; if live session matches, error
        const existing = await this._findLiveMatch(projectDir, stage);
        if (existing !== null) {
          ctx.stderr.write(
            JSON.stringify({ error: 'Session already running', sessionId: existing }) + '\n',
          );
          return EXIT_RUNTIME;
        }
        await sleep(200);
        try {
          fs.mkdirSync(lockPath, { recursive: false });
          lockAcquired = true;
        } catch {
          ctx.stderr.write(JSON.stringify({ error: 'session already starting' }) + '\n');
          return EXIT_RUNTIME;
        }
      } else {
        ctx.stderr.write(JSON.stringify({ error: (err as Error).message }) + '\n');
        return EXIT_RUNTIME;
      }
    }

    let sessionId: string | null = null;
    try {
      // Step 3: pre-flight live check / cleanup dead
      for (const id of allSessionDirs()) {
        const meta = tryReadMeta(id);
        if (meta === null) continue;
        if (path.resolve(meta.projectDir) === projectDir && (meta.stage ?? 'default') === stage) {
          if (meta.status === 'starting' || meta.pid === null) {
            // Still starting elsewhere; treat as already running.
            ctx.stderr.write(
              JSON.stringify({ error: 'Session already running', sessionId: id }) + '\n',
            );
            return EXIT_RUNTIME;
          }
          const liveness = await probeLiveness(meta);
          if (liveness.pidAlive && liveness.socketAlive) {
            ctx.stderr.write(
              JSON.stringify({ error: 'Session already running', sessionId: id }) + '\n',
            );
            return EXIT_RUNTIME;
          }
          cleanupStaleSession(id);
        }
      }

      // Step 4: sessionId
      sessionId = crypto.randomUUID();
      const sDir = sessionDir(sessionId);
      const sockPath = socketPathFn(sessionId);

      // Step 5+7: create dir + write initial meta atomically
      fs.mkdirSync(sDir, { recursive: true });
      const createdAt = Date.now();
      const firstMeta = {
        sessionId,
        projectDir,
        stage,
        pid: null,
        pgid: null,
        startTimeMs: null,
        socketPath: sockPath,
        createdAt,
        status: 'starting' as const,
        ...(awsProfile !== undefined ? { awsProfile } : {}),
        ...(awsRegion !== undefined ? { awsRegion } : {}),
      };
      writeMeta(sessionId, firstMeta);

      // Step 8: spawn
      const env: NodeJS.ProcessEnv = {};
      env['PATH'] = augmentPath(projectDir, process.env['PATH']);
      if (awsProfile !== undefined) env['AWS_PROFILE'] = awsProfile;
      if (awsRegion !== undefined) env['AWS_REGION'] = awsRegion;
      const { pid, startTimeMs } = await this._spawnDaemon({
        sessionId,
        sessionDir: sDir,
        env,
      });

      // Step 9: update meta with pid (preserve createdAt from the first write
      // per shared-session-store-v2 §4 A2; second write only refreshes the
      // mutable fields and sets lastUpdatedAt).
      let pgid: number | null = null;
      try {
        const fn = (process as { getpgid?: (p: number) => number }).getpgid;
        pgid = typeof fn === 'function' ? fn(pid) : pid;
      } catch {
        pgid = pid;
      }
      writeMeta(sessionId, {
        ...firstMeta,
        pid,
        pgid,
        startTimeMs,
        status: 'running',
        lastUpdatedAt: Date.now(),
      });

      // Step 10: optionally wait for ready
      if (!noWait) {
        const client = await IpcClient.connect(sockPath, 5000);
        try {
          const waitResult = await client.call('wait_for_ready', { timeoutMs: 300_000 });
          ctx.stdout.write(
            formatOutput(
              {
                sessionId,
                projectDir,
                stage,
                status: 'ready',
                ...(waitResult as object),
              },
              { pretty },
            ) + '\n',
          );
        } finally {
          client.close();
        }
      } else {
        ctx.stdout.write(
          formatOutput({ sessionId, projectDir, stage, status: 'started' }, { pretty }) + '\n',
        );
      }

      return EXIT_OK;
    } catch (err) {
      if (sessionId !== null) {
        try {
          cleanupStaleSession(sessionId);
        } catch {
          // ignore
        }
      }
      ctx.stderr.write(JSON.stringify({ error: (err as Error).message }) + '\n');
      return EXIT_RUNTIME;
    } finally {
      if (lockAcquired) {
        try {
          fs.rmdirSync(lockPath);
        } catch {
          // ignore
        }
      }
    }
  }

  private async _findLiveMatch(projectDir: string, stage: string): Promise<string | null> {
    for (const id of allSessionDirs()) {
      const meta = tryReadMeta(id);
      if (meta === null) continue;
      if (path.resolve(meta.projectDir) === projectDir && (meta.stage ?? 'default') === stage) {
        if (meta.status === 'starting' || meta.pid === null) return id;
        const liveness = await probeLiveness(meta);
        if (liveness.pidAlive && liveness.socketAlive) return id;
      }
    }
    return null;
  }
}
