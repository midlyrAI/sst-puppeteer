import pkg from '../../package.json' with { type: 'json' };
import { Command, type CliContext } from './command.js';

export class VersionCommand extends Command {
  readonly name = 'version';
  readonly description = 'Print the @sst-puppeteer/cli package version.';

  override async execute(_args: readonly string[], ctx: CliContext): Promise<number> {
    ctx.stdout.write(`${pkg.version}\n`);
    return 0;
  }
}
