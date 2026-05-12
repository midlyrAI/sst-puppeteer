import { DaemonEntryCommand } from './daemon-entry-command.js';
import { GetCommandStatusCommand } from './get-command-status-command.js';
import { ListCommandsCommand } from './list-commands-command.js';
import { ListSessionsCommand } from './list-sessions-command.js';
import { ReadCommandLogsCommand } from './read-command-logs-command.js';
import { CommandRegistry } from './registry.js';
import { StartCommand } from './start-command.js';
import { StopCommand } from './stop-command.js';
import { VersionCommand } from './version-command.js';
import { WaitForNextReadyCommand } from './wait-for-next-ready-command.js';
import { WaitForReadyCommand } from './wait-for-ready-command.js';

export { Command, type CliContext } from './command.js';
export { CommandRegistry } from './registry.js';
export { VersionCommand } from './version-command.js';
export { StartCommand } from './start-command.js';
export { StopCommand } from './stop-command.js';
export { ListSessionsCommand } from './list-sessions-command.js';
export { DaemonEntryCommand } from './daemon-entry-command.js';
export { WaitForReadyCommand } from './wait-for-ready-command.js';
export { WaitForNextReadyCommand } from './wait-for-next-ready-command.js';
export { ListCommandsCommand } from './list-commands-command.js';
export { GetCommandStatusCommand } from './get-command-status-command.js';
export { ReadCommandLogsCommand } from './read-command-logs-command.js';

export const defaultRegistry = (): CommandRegistry => {
  const registry = new CommandRegistry();
  registry.register(new VersionCommand());
  registry.register(new StartCommand());
  registry.register(new StopCommand());
  registry.register(new ListSessionsCommand());
  registry.register(new WaitForReadyCommand());
  registry.register(new WaitForNextReadyCommand());
  registry.register(new ListCommandsCommand());
  registry.register(new GetCommandStatusCommand());
  registry.register(new ReadCommandLogsCommand());
  registry.register(new DaemonEntryCommand());
  return registry;
};
