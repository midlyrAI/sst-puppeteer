import { CommandNotFoundError } from '../errors.js';
import { type Logger, NoopLogger } from '../api/logger.js';
import {
  type Command,
  type CommandLastExit,
  type CommandSpec,
  type CommandStatus,
} from './command.js';

export type CommandStatusChangeHandler = (
  name: string,
  from: CommandStatus,
  to: CommandStatus,
) => void;

interface RegistryWaiter {
  name: string;
  target: CommandStatus;
  resolve: () => void;
  reject: (reason: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout> | undefined;
}

export class CommandRegistry {
  private _commands: Map<string, Command> = new Map();
  private _changeHandlers: Set<CommandStatusChangeHandler> = new Set();
  private _waiters: RegistryWaiter[] = [];
  private readonly _logger: Logger;

  constructor(opts?: { logger?: Logger }) {
    this._logger = opts?.logger ?? new NoopLogger();
  }

  register(spec: CommandSpec): void {
    this._commands.set(spec.name, { spec, status: 'idle' });
  }

  /** Drop a registered command. No-op if the name is not registered. */
  unregister(name: string): void {
    this._commands.delete(name);
  }

  has(name: string): boolean {
    return this._commands.has(name);
  }

  applyStatus(name: string, status: CommandStatus, lastExit?: CommandLastExit): void {
    const existing = this._commands.get(name);
    if (existing === undefined) {
      throw new CommandNotFoundError(`Command "${name}" is not registered.`);
    }

    const from = existing.status;
    if (from === status) {
      return;
    }

    let startedAt: number | undefined = existing.startedAt;
    if (status === 'starting' || status === 'running') {
      if (startedAt === undefined) {
        startedAt = Date.now();
      }
    } else if (status === 'stopped' || status === 'errored' || status === 'idle') {
      startedAt = undefined;
    }

    const updated: Command = {
      spec: existing.spec,
      status,
      lastExit: lastExit ?? existing.lastExit,
      startedAt,
    };
    this._commands.set(name, updated);

    for (const handler of this._changeHandlers) {
      try {
        handler(name, from, status);
      } catch (err) {
        this._logger.error('[CommandRegistry] onChange handler threw', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const remaining: RegistryWaiter[] = [];
    for (const waiter of this._waiters) {
      if (waiter.name === name && waiter.target === status) {
        if (waiter.timeoutId !== undefined) clearTimeout(waiter.timeoutId);
        waiter.resolve();
      } else {
        remaining.push(waiter);
      }
    }
    this._waiters = remaining;
  }

  get(name: string): Command | undefined {
    return this._commands.get(name);
  }

  list(): readonly Command[] {
    return Array.from(this._commands.values());
  }

  waitForStatus(name: string, target: CommandStatus, timeoutMs?: number): Promise<void> {
    const existing = this._commands.get(name);
    if (existing === undefined) {
      throw new CommandNotFoundError(`Command "${name}" is not registered.`);
    }

    if (existing.status === target) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: RegistryWaiter = {
        name,
        target,
        resolve,
        reject,
        timeoutId: undefined,
      };

      if (timeoutMs !== undefined) {
        waiter.timeoutId = setTimeout(() => {
          this._waiters = this._waiters.filter((w) => w !== waiter);
          const current = this._commands.get(name)?.status ?? 'idle';
          reject(
            new Error(
              `Timed out waiting for command "${name}" to reach status "${target}" (current: "${current}")`,
            ),
          );
        }, timeoutMs);
      }

      this._waiters.push(waiter);
    });
  }

  onChange(handler: CommandStatusChangeHandler): () => void {
    this._changeHandlers.add(handler);
    return () => {
      this._changeHandlers.delete(handler);
    };
  }
}
