import { CommandNotFoundError } from '../../common/error/errors.js';
import { type Logger, NoopLogger } from '../../common/logger/logger.js';
import {
  CommandStatus,
  type Command,
  type CommandLastExit,
  type CommandSpec,
} from '../../common/contract/command.js';

export type CommandStatusChangeHandler = (
  name: string,
  from: CommandStatus,
  to: CommandStatus,
) => void;

interface RegistryWaiter {
  name: string;
  targets: ReadonlySet<CommandStatus>;
  resolve: (status: CommandStatus) => void;
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
    this._commands.set(spec.name, { spec, status: CommandStatus.IDLE });
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
    if (status === CommandStatus.STARTING || status === CommandStatus.RUNNING) {
      if (startedAt === undefined) {
        startedAt = Date.now();
      }
    } else if (
      status === CommandStatus.STOPPED ||
      status === CommandStatus.ERRORED ||
      status === CommandStatus.IDLE
    ) {
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
      if (waiter.name === name && waiter.targets.has(status)) {
        if (waiter.timeoutId !== undefined) clearTimeout(waiter.timeoutId);
        waiter.resolve(status);
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
    return this.waitForAnyStatus(name, [target], timeoutMs).then(() => undefined);
  }

  /**
   * Resolves with the first of `targets` that the command reaches. Use for
   * run-to-completion processes that may transition `starting → stopped`
   * without ever observing `running`: pass `[RUNNING, STOPPED, ERRORED]` and
   * branch on the resolved value.
   */
  waitForAnyStatus<T extends CommandStatus>(
    name: string,
    targets: readonly T[],
    timeoutMs?: number,
  ): Promise<T> {
    const existing = this._commands.get(name);
    if (existing === undefined) {
      throw new CommandNotFoundError(`Command "${name}" is not registered.`);
    }

    const targetSet: ReadonlySet<T> = new Set(targets);
    if ((targetSet as ReadonlySet<CommandStatus>).has(existing.status)) {
      return Promise.resolve(existing.status as T);
    }

    return new Promise<T>((resolve, reject) => {
      const waiter: RegistryWaiter = {
        name,
        targets: targetSet as ReadonlySet<CommandStatus>,
        resolve: resolve as (s: CommandStatus) => void,
        reject,
        timeoutId: undefined,
      };

      if (timeoutMs !== undefined) {
        waiter.timeoutId = setTimeout(() => {
          this._waiters = this._waiters.filter((w) => w !== waiter);
          const current = this._commands.get(name)?.status ?? CommandStatus.IDLE;
          const targetList = [...targetSet].map((s) => `"${s}"`).join(' | ');
          reject(
            new Error(
              `Timed out waiting for command "${name}" to reach status ${targetList} (current: "${current}")`,
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
