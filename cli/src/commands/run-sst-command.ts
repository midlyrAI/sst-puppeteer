import * as path from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { runSst } from '../../../shared/src/core/index.js';
import { CliRunSstOutputSchema } from '../../../shared/src/session/wire-schemas.js';
import { EXIT_OK, EXIT_RUNTIME } from '../output/exit-codes.js';
import { formatOutput } from '../output/formatter.js';
import { Command, type CliContext, type HelpSchema } from './command.js';

export class RunSstCommand extends Command {
  readonly name = 'run-sst';
  readonly description = 'Run a one-shot sst subcommand (no daemon required).';

  override helpSchema(): HelpSchema {
    return {
      input: z.object({
        project: z.string().optional().describe('Project directory (defaults to cwd)'),
        stage: z.string().optional().describe('SST stage'),
        timeout: z.number().optional().describe('Timeout in milliseconds'),
        pretty: z.boolean().optional(),
      }),
      output: CliRunSstOutputSchema,
    };
  }

  override async execute(args: readonly string[], ctx: CliContext): Promise<number> {
    // Split on '--' to separate our flags from sst passthrough args.
    const rawArgs = [...args];
    const separatorIdx = rawArgs.indexOf('--');
    let ownArgs: string[];
    let sstArgs: string[];
    if (separatorIdx === -1) {
      ownArgs = rawArgs;
      sstArgs = [];
    } else {
      ownArgs = rawArgs.slice(0, separatorIdx);
      sstArgs = rawArgs.slice(separatorIdx + 1);
    }

    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: ownArgs,
        options: {
          project: { type: 'string' },
          stage: { type: 'string' },
          timeout: { type: 'string' },
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
      return EXIT_OK;
    }
    if (parsed.values['help'] === true) {
      ctx.stdout.write(
        'Usage: sst-puppeteer run-sst [--project DIR] [--stage S] [--timeout MS] [--pretty] -- [sst args...]\n',
      );
      return EXIT_OK;
    }

    // Positionals before '--' are also treated as sst args when no '--' separator.
    if (separatorIdx === -1 && parsed.positionals.length > 0) {
      sstArgs = parsed.positionals;
    }

    const projectRaw = parsed.values['project'] as string | undefined;
    const projectDir = projectRaw ? path.resolve(ctx.cwd, projectRaw) : ctx.cwd;

    const stage = parsed.values['stage'] as string | undefined;
    const timeoutRaw = parsed.values['timeout'] as string | undefined;
    const timeoutMs = timeoutRaw !== undefined ? Number(timeoutRaw) : undefined;
    const pretty = parsed.values['pretty'] === true;

    try {
      const result = await runSst({ projectDir, args: sstArgs, stage, timeoutMs });
      ctx.stdout.write(formatOutput(result, { pretty }) + '\n');
      return result.exitCode === 0 ? EXIT_OK : EXIT_RUNTIME;
    } catch (err) {
      ctx.stderr.write(JSON.stringify({ error: (err as Error).message }) + '\n');
      return EXIT_RUNTIME;
    }
  }
}
