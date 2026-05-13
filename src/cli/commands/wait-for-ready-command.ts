import { parseArgs } from 'node:util';
import { z } from 'zod';
import { CliWaitForReadyOutputSchema } from '../../session/wire-schemas.js';
import { EXIT_OK, EXIT_RUNTIME } from '../output/exit-codes.js';
import { formatOutput } from '../output/formatter.js';
import {
  SessionAmbiguousError,
  SessionNotFoundError,
  SessionManager,
  SessionStartingError,
  SessionUnhealthyError,
} from '../../session/manager.js';
import { Command, type CliContext, type HelpSchema } from './command.js';

export class WaitForReadyCommand extends Command {
  readonly name = 'wait-for-ready';
  readonly description = 'Wait until the session daemon reports the SST dev server is ready.';

  override helpSchema(): HelpSchema {
    return {
      input: z.object({
        session: z.string().optional(),
        project: z.string().optional(),
        stage: z.string().optional(),
        timeout: z.number().optional().describe('Timeout in milliseconds (default 300000)'),
        pretty: z.boolean().optional(),
      }),
      output: CliWaitForReadyOutputSchema,
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
          timeout: { type: 'string' },
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
      return EXIT_OK;
    }
    if (parsed.values['help'] === true) {
      ctx.stdout.write(
        'Usage: sst-puppeteer wait-for-ready [--session ID | --project DIR --stage S] [--timeout <ms>]\n',
      );
      return EXIT_OK;
    }

    const pretty = parsed.values['pretty'] === true;
    const timeoutRaw = parsed.values['timeout'];
    const timeoutMs = timeoutRaw !== undefined ? parseInt(timeoutRaw as string, 10) : 300_000;

    const resolver = new SessionManager();
    let resolved;
    try {
      resolved = await resolver.resolve({
        session: parsed.values['session'] as string | undefined,
        project: parsed.values['project'] as string | undefined,
        stage: parsed.values['stage'] as string | undefined,
      });
    } catch (err) {
      if (err instanceof SessionNotFoundError) {
        ctx.stderr.write(JSON.stringify({ error: err.message }) + '\n');
        return 3;
      }
      if (err instanceof SessionUnhealthyError) {
        ctx.stderr.write(JSON.stringify({ error: err.message, ...err.details }) + '\n');
        return 4;
      }
      if (err instanceof SessionAmbiguousError) {
        ctx.stderr.write(JSON.stringify({ error: err.message, candidates: err.candidates }) + '\n');
        return 2;
      }
      if (err instanceof SessionStartingError) {
        ctx.stderr.write(JSON.stringify({ error: err.message, retryAfterMs: 2000 }) + '\n');
        return 4;
      }
      ctx.stderr.write(JSON.stringify({ error: (err as Error).message }) + '\n');
      return EXIT_RUNTIME;
    }

    const { client } = resolved;
    try {
      const raw = await client.call('wait_for_ready', { timeoutMs });
      const result = CliWaitForReadyOutputSchema.parse(raw);
      ctx.stdout.write(formatOutput(result, { pretty }) + '\n');
      return EXIT_OK;
    } catch (err) {
      ctx.stderr.write(JSON.stringify({ error: (err as Error).message }) + '\n');
      return EXIT_RUNTIME;
    } finally {
      client.close();
    }
  }
}
