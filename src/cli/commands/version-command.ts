import { parseArgs } from 'node:util';
import pkg from '../../../package.json' with { type: 'json' };
import { EXIT_OK } from '../output/exit-codes.js';
import { Command, type CliContext } from './command.js';

export class VersionCommand extends Command {
  readonly name = 'version';
  readonly description = 'Print the @midlyr/sst-puppeteer-mcp package version.';

  override async execute(args: readonly string[], ctx: CliContext): Promise<number> {
    let parsed: ReturnType<typeof parseArgs>;
    try {
      parsed = parseArgs({
        args: [...args],
        options: {
          help: { type: 'boolean', default: false },
          'help-json': { type: 'boolean', default: false },
        },
        allowPositionals: false,
        strict: true,
      });
    } catch {
      ctx.stdout.write(`${pkg.version}\n`);
      return EXIT_OK;
    }

    if (parsed.values['help-json'] === true) {
      ctx.stdout.write(
        JSON.stringify({ name: this.name, description: this.description }) + '\n',
      );
      return EXIT_OK;
    }
    if (parsed.values['help'] === true) {
      ctx.stdout.write(
        [
          'Usage: sst-puppeteer version',
          '',
          'Print the current package version.',
          '',
          'Example:',
          '  sst-puppeteer version',
        ].join('\n') + '\n',
      );
      return EXIT_OK;
    }

    ctx.stdout.write(`${pkg.version}\n`);
    return EXIT_OK;
  }
}
