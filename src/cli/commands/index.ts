import { DaemonEntryCommand } from './daemon-entry-command.js';
import { ListSessionsCommand } from './list-sessions-command.js';
import { CommandRegistry } from './registry.js';
import { StartCommand } from './start-command.js';
import { StopCommand } from './stop-command.js';
import { VersionCommand } from './version-command.js';

export { Command, type CliContext } from './command.js';
export { CommandRegistry } from './registry.js';
export { VersionCommand } from './version-command.js';
export { StartCommand } from './start-command.js';
export { StopCommand } from './stop-command.js';
export { ListSessionsCommand } from './list-sessions-command.js';
export { DaemonEntryCommand } from './daemon-entry-command.js';

export const defaultRegistry = (): CommandRegistry => {
  const registry = new CommandRegistry();
  registry.register(new VersionCommand());
  registry.register(new StartCommand());
  registry.register(new StopCommand());
  registry.register(new ListSessionsCommand());
  registry.register(new DaemonEntryCommand());
  return registry;
};
