#!/usr/bin/env node
/**
 * Test-only CLI entry. Mirrors `bin/cli.ts` exactly, except `StartCommand`
 * is constructed with `fakeSpawnDaemon` so the spawned daemon is the
 * test fake (no real `sst dev`). All other commands use the production
 * code paths verbatim, so cross-surface visibility (CLI start writes
 * meta.json that MCP reads) is exercised against the real on-disk store.
 */
import { CliRunner } from '../../cli/src/runner.js';
import { CommandRegistry } from '../../cli/src/commands/registry.js';
import { VersionCommand } from '../../cli/src/commands/version-command.js';
import { StartCommand } from '../../cli/src/commands/start-command.js';
import { StopCommand } from '../../cli/src/commands/stop-command.js';
import { ListSessionsCommand } from '../../cli/src/commands/list-sessions-command.js';
import { WaitForReadyCommand } from '../../cli/src/commands/wait-for-ready-command.js';
import { WaitForNextReadyCommand } from '../../cli/src/commands/wait-for-next-ready-command.js';
import { ListCommandsCommand } from '../../cli/src/commands/list-commands-command.js';
import { GetCommandStatusCommand } from '../../cli/src/commands/get-command-status-command.js';
import { ReadCommandLogsCommand } from '../../cli/src/commands/read-command-logs-command.js';
import { StartSstCommandCommand } from '../../cli/src/commands/start-sst-command-command.js';
import { StopSstCommandCommand } from '../../cli/src/commands/stop-sst-command-command.js';
import { RestartCommandCommand } from '../../cli/src/commands/restart-command-command.js';
import { fakeSpawnDaemon } from './fake-spawn-daemon.js';

const main = async (): Promise<void> => {
  const registry = new CommandRegistry();
  registry.register(new VersionCommand());
  registry.register(new StartCommand(fakeSpawnDaemon));
  registry.register(new StopCommand());
  registry.register(new ListSessionsCommand());
  registry.register(new WaitForReadyCommand());
  registry.register(new WaitForNextReadyCommand());
  registry.register(new ListCommandsCommand());
  registry.register(new GetCommandStatusCommand());
  registry.register(new ReadCommandLogsCommand());
  registry.register(new StartSstCommandCommand());
  registry.register(new StopSstCommandCommand());
  registry.register(new RestartCommandCommand());

  const runner = new CliRunner({
    registry,
    ctx: {
      stdout: process.stdout,
      stderr: process.stderr,
      cwd: process.cwd(),
    },
  });
  const code = await runner.run(process.argv);
  process.exit(code);
};

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
