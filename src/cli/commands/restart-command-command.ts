import { parseArgs } from 'node:util';
import { z } from 'zod';
import { CliRestartCommandOutputSchema } from '../daemon/wire-schemas.js';
import { EXIT_OK, EXIT_RUNTIME } from '../output/exit-codes.js';
import { formatOutput } from '../output/formatter.js';
import {
  SessionAmbiguousError,
  SessionNotFoundError,
  SessionResolver,
  SessionStartingError,
  SessionUnhealthyError,
} from '../state/session-resolver.js';
import { Command, type CliContext, type HelpSchema } from './command.js';

export class RestartCommandCommand extends Command {
  readonly name = 'restart-command';
  readonly description = 'Restart a named pane command in the session.';

  override helpSchema(): HelpSchema {
    return {
      input: z.object({
        session: z.string().optional(),
        project: z.string().optional(),
        stage: z.string().optional(),
        'command-name': z.string().describe('Name of the command to restart (required)'),
        pretty: z.boolean().optional(),
      }),
      output: CliRestartCommandOutputSchema,
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
          'command-name': { type: 'string' },
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
        'Usage: sst-puppeteer restart-command --command-name <name> [--session ID | --project DIR --stage S]\n',
      );
      return EXIT_OK;
    }

    const commandName = parsed.values['command-name'] as string | undefined;
    if (commandName === undefined) {
      ctx.stderr.write(JSON.stringify({ error: '--command-name is required' }) + '\n');
      return 2;
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
      if (err instanceof SessionNotFoundError) {
        ctx.stderr.write(JSON.stringify({ error: err.message }) + '\n');
        return 3;
      }
      if (err instanceof SessionUnhealthyError) {
        ctx.stderr.write(JSON.stringify({ error: err.message, ...err.details }) + '\n');
        return 4;
      }
      if (err instanceof SessionAmbiguousError) {
        ctx.stderr.write(
          JSON.stringify({ error: err.message, candidates: err.candidates }) + '\n',
        );
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
      const raw = await client.call('restart_command', { commandName });
      const result = CliRestartCommandOutputSchema.parse(raw);
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
