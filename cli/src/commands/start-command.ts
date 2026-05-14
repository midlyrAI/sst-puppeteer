import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  SessionBusyError,
  SessionManager,
  SessionStartFailedError,
  type SpawnDaemonFn,
} from '../../../shared/src/session/manager.js';
import { EXIT_OK, EXIT_RUNTIME } from '../output/exit-codes.js';
import { formatOutput } from '../output/formatter.js';
import { Command, type CliContext, type HelpSchema } from './command.js';

export type { SpawnDaemonFn } from '../../../shared/src/session/manager.js';

export class StartCommand extends Command {
  readonly name = 'start';
  readonly description = 'Spawn a session daemon for a project + stage.';

  constructor(private readonly _spawnDaemon?: SpawnDaemonFn) {
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
        status: z.enum(['ready', 'started', 'failed']),
        reused: z.boolean(),
        error: z.string().optional(),
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
          'Spawn a session daemon for a project + stage, OR attach to an existing one.',
          'If a daemon is already running for the same (projectDir, stage), returns its',
          'sessionId with reused:true (idempotent upsert). By default waits until the SST',
          'dev server reports ready. Use --no-wait to return immediately after fork.',
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

    const manager = new SessionManager(
      this._spawnDaemon !== undefined ? { spawnDaemon: this._spawnDaemon } : {},
    );

    try {
      const result = await manager.startOrAttach({
        projectDir,
        stage,
        awsProfile,
        awsRegion,
        wait: !noWait,
      });
      ctx.stdout.write(
        formatOutput(
          {
            sessionId: result.sessionId,
            projectDir,
            stage,
            status: result.status,
            reused: result.reused,
            ...(result.status === 'failed' ? { error: result.error } : {}),
          },
          { pretty },
        ) + '\n',
      );
      return result.status === 'failed' ? EXIT_RUNTIME : EXIT_OK;
    } catch (err) {
      if (err instanceof SessionBusyError) {
        ctx.stderr.write(
          JSON.stringify({
            error: err.message,
            code: err.code,
            dedupKey: err.dedupKey,
            lockAgeMs: err.lockAgeMs,
          }) + '\n',
        );
        return EXIT_RUNTIME;
      }
      if (err instanceof SessionStartFailedError) {
        ctx.stderr.write(
          JSON.stringify({
            error: err.message,
            sessionId: err.sessionId,
            failureReason: err.failureReason,
          }) + '\n',
        );
        return EXIT_RUNTIME;
      }
      ctx.stderr.write(JSON.stringify({ error: (err as Error).message }) + '\n');
      return EXIT_RUNTIME;
    }
  }
}
