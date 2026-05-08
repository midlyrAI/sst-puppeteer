import { type Command, type CommandStatus } from '../domain/command.js';

/**
 * Read-only view of the registered commands and their per-pane logs.
 *
 * @example
 * ```ts
 * for (const cmd of session.listCommands()) {
 *   logger.info(cmd.spec.name + ': ' + session.getCommandStatus(cmd.spec.name));
 * }
 * const tail = await session.readCommandLogs({ commandName: 'Service-Web', limit: 50 });
 * ```
 *
 * @throws {CommandNotFoundError} when `name`/`commandName` is not registered.
 */
export interface ICommandStateReader {
  listCommands(): readonly Command[];
  getCommandStatus(name: string): CommandStatus;
  readCommandLogs(opts: {
    commandName: string;
    since?: number;
    limit?: number;
  }): Promise<readonly string[]>;
}
