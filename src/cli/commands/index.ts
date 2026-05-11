import { CommandRegistry } from './registry.js';
import { VersionCommand } from './version-command.js';

export { Command, type CliContext } from './command.js';
export { CommandRegistry } from './registry.js';
export { VersionCommand } from './version-command.js';

export const defaultRegistry = (): CommandRegistry => {
  const registry = new CommandRegistry();
  registry.register(new VersionCommand());
  return registry;
};
