import { parseArgs } from 'node:util';
import { z } from 'zod';
import { EXIT_OK } from '../output/exit-codes.js';
import { formatOutput } from '../output/formatter.js';
import { cleanupStaleSession, probeLiveness, tryReadMeta } from '../../session/meta.js';
import { allSessionDirs } from '../../session/paths.js';
import { Command, type CliContext, type HelpSchema } from './command.js';

interface SessionListEntry {
  readonly sessionId: string;
  readonly projectDir?: string;
  readonly stage?: string;
  readonly status: 'starting' | 'running' | 'stale';
  readonly pid?: number | null;
  readonly cleaned?: boolean;
}

export class ListSessionsCommand extends Command {
  readonly name = 'list';
  readonly description = 'List known sessions with liveness status.';

  override helpSchema(): HelpSchema {
    return {
      input: z.object({ pretty: z.boolean().optional() }),
      output: z.object({
        sessions: z.array(
          z.object({
            sessionId: z.string(),
            projectDir: z.string().optional(),
            stage: z.string().optional(),
            status: z.enum(['starting', 'running', 'stale']),
            pid: z.number().nullable().optional(),
            cleaned: z.boolean().optional(),
          }),
        ),
      }),
    };
  }

  override async execute(args: readonly string[], ctx: CliContext): Promise<number> {
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: [...args],
        options: {
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
          'Usage: sst-puppeteer list [--pretty]',
          '',
          'List all known sessions with their liveness status.',
          'Stale sessions (daemon no longer running) are cleaned up automatically.',
          '',
          'Example:',
          '  sst-puppeteer list',
          '  sst-puppeteer list --pretty',
        ].join('\n') + '\n',
      );
      return 0;
    }
    const pretty = parsed.values['pretty'] === true;

    const sessions: SessionListEntry[] = [];

    for (const id of allSessionDirs()) {
      const meta = tryReadMeta(id);
      if (meta === null) {
        cleanupStaleSession(id);
        sessions.push({ sessionId: id, status: 'stale', cleaned: true });
        continue;
      }
      if (meta.status === 'starting' || meta.pid === null) {
        sessions.push({
          sessionId: id,
          projectDir: meta.projectDir,
          stage: meta.stage,
          status: 'starting',
          pid: meta.pid,
        });
        continue;
      }
      const { pidAlive, socketAlive } = await probeLiveness(meta);
      if (pidAlive && socketAlive) {
        sessions.push({
          sessionId: id,
          projectDir: meta.projectDir,
          stage: meta.stage,
          status: 'running',
          pid: meta.pid,
        });
      } else {
        cleanupStaleSession(id);
        sessions.push({
          sessionId: id,
          projectDir: meta.projectDir,
          stage: meta.stage,
          status: 'stale',
          cleaned: true,
        });
      }
    }

    ctx.stdout.write(formatOutput({ sessions }, { pretty }) + '\n');
    return EXIT_OK;
  }
}
