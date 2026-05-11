import { SstPuppeteerError } from '../index.js';
import { type CliContext } from './commands/command.js';
import { type CommandRegistry } from './commands/registry.js';

export interface CliRunnerOptions {
  readonly registry: CommandRegistry;
  readonly ctx: CliContext;
}

export class CliRunner {
  constructor(private readonly _opts: CliRunnerOptions) {}

  async run(argv: readonly string[]): Promise<number> {
    const commandName = argv[2];
    const { registry, ctx } = this._opts;

    if (!commandName || commandName === '--help' || commandName === '-h') {
      this._writeUsage(registry, ctx);
      return commandName ? 0 : 2;
    }

    const command = registry.get(commandName);
    if (!command) {
      ctx.stderr.write(`Unknown command: ${commandName}\n\n`);
      this._writeUsage(registry, ctx);
      return 2;
    }

    try {
      return await command.execute(argv.slice(3), ctx);
    } catch (err) {
      if (err instanceof SstPuppeteerError) {
        ctx.stderr.write(`${err.name}: ${err.message}\n`);
        return 1;
      }
      throw err;
    }
  }

  private _writeUsage(registry: CommandRegistry, ctx: CliContext): void {
    ctx.stderr.write('Usage: sst-puppeteer <command> [args]\n\nCommands:\n');
    for (const cmd of registry.list()) {
      ctx.stderr.write(`  ${cmd.name.padEnd(12)} ${cmd.description}\n`);
    }
  }
}

export const runCli = async (argv: readonly string[], opts: CliRunnerOptions): Promise<number> =>
  new CliRunner(opts).run(argv);
