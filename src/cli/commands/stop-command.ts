import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { EXIT_OK, EXIT_RUNTIME } from '../output/exit-codes.js';
import { formatOutput } from '../output/formatter.js';
import {
  SessionAmbiguousError,
  SessionNotFoundError,
  SessionResolver,
  SessionStartingError,
  SessionUnhealthyError,
} from '../state/session-resolver.js';
import { tryReadMeta, validatePidOwnership } from '../state/meta.js';
import { lockDir, metaPath, sessionDir } from '../state/paths.js';
import { Command, type CliContext, type HelpSchema } from './command.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const dedupKeyFor = (projectDir: string, stage: string): string =>
  crypto
    .createHash('sha256')
    .update(`${projectDir}:${stage}`)
    .digest('hex')
    .slice(0, 12);

export class StopCommand extends Command {
  readonly name = 'stop';
  readonly description = 'Stop a session daemon and clean up its state.';

  override helpSchema(): HelpSchema {
    return {
      input: z.object({
        session: z.string().optional(),
        project: z.string().optional(),
        stage: z.string().optional(),
        pretty: z.boolean().optional(),
      }),
      output: z.object({
        stopped: z.literal(true),
        sessionId: z.string().optional(),
        alreadyStale: z.boolean().optional(),
      }),
    };
  }

  override async execute(args: readonly string[], ctx: CliContext): Promise<number> {
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: [...args],
        options: {
          session: { type: 'string' },
          project: { type: 'string' },
          stage: { type: 'string' },
          pretty: { type: 'boolean', default: false },
          help: { type: 'boolean', default: false },
          'help-json': { type: 'boolean', default: false },
        },
        allowPositionals: false,
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
          'Usage: sst-puppeteer stop [--session ID | --project DIR --stage S]',
          '',
          'Stop the daemon for a session and clean up its state directory.',
          'If no session flag is given and exactly one session is running, it is used implicitly.',
          '',
          'Example:',
          '  sst-puppeteer stop --session <sessionId>',
          '  sst-puppeteer stop --project ./my-app --stage dev',
        ].join('\n') + '\n',
      );
      return 0;
    }

    const pretty = parsed.values['pretty'] === true;
    const resolver = new SessionResolver();

    let resolved;
    try {
      resolved = await resolver.resolve({
        session: parsed.values['session'] as string | undefined,
        project: parsed.values['project'] as string | undefined,
        stage: parsed.values['stage'] as string | undefined,
      });
    } catch (err) {
      if (err instanceof SessionUnhealthyError) {
        ctx.stdout.write(
          formatOutput({ stopped: true, alreadyStale: true }, { pretty }) + '\n',
        );
        return EXIT_OK;
      }
      if (err instanceof SessionNotFoundError) {
        ctx.stderr.write(JSON.stringify({ error: err.message }) + '\n');
        return 3;
      }
      if (err instanceof SessionAmbiguousError) {
        ctx.stderr.write(
          JSON.stringify({ error: err.message, candidates: err.candidates }) + '\n',
        );
        return 2;
      }
      if (err instanceof SessionStartingError) {
        ctx.stderr.write(JSON.stringify({ error: err.message }) + '\n');
        return 4;
      }
      ctx.stderr.write(JSON.stringify({ error: (err as Error).message }) + '\n');
      return EXIT_RUNTIME;
    }

    const { sessionId, client, meta } = resolved;
    try {
      try {
        await client.call('stop_session', {});
      } catch {
        // Daemon may close socket abruptly after responding; ignore.
      }
    } finally {
      client.close();
    }

    // Wait up to 10s for daemon to exit (meta status=stopped OR meta gone OR
    // pid disappeared). Track which terminating condition we observed.
    const startedWait = Date.now();
    let gracefulExit = false;
    while (Date.now() - startedWait < 10_000) {
      const m = tryReadMeta(sessionId);
      if (m === null) {
        gracefulExit = true;
        break;
      }
      if (m.status === 'stopped') {
        gracefulExit = true;
        break;
      }
      const pid = m.pid;
      if (pid !== null) {
        try {
          process.kill(pid, 0);
        } catch {
          gracefulExit = true;
          break;
        }
      }
      await sleep(100);
    }

    // SIGTERM fallback (only if graceful path didn't complete).
    const stillRunning = (): boolean => {
      if (meta.pid === null) return false;
      try {
        process.kill(meta.pid, 0);
        return true;
      } catch {
        return false;
      }
    };

    if (!gracefulExit && stillRunning()) {
      if (await validatePidOwnership(meta)) {
        try {
          process.kill(meta.pid!, 'SIGTERM');
        } catch {
          // ignore
        }
      }
      const sigStart = Date.now();
      while (Date.now() - sigStart < 5_000 && stillRunning()) {
        await sleep(100);
      }
      if (stillRunning()) {
        if (await validatePidOwnership(meta)) {
          try {
            process.kill(meta.pid!, 'SIGKILL');
          } catch {
            // ignore
          }
        }
      }
    }

    // Cleanup dir + lock
    try {
      fs.rmSync(sessionDir(sessionId), { recursive: true, force: true });
    } catch {
      // ignore
    }
    try {
      const key = dedupKeyFor(meta.projectDir, meta.stage ?? 'default');
      fs.rmdirSync(lockDir(key));
    } catch {
      // ignore
    }
    // ensure meta path is gone
    try {
      fs.unlinkSync(metaPath(sessionId));
    } catch {
      // ignore
    }

    ctx.stdout.write(formatOutput({ stopped: true, sessionId }, { pretty }) + '\n');
    return EXIT_OK;
  }
}
