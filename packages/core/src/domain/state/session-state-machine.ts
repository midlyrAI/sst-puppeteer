import { UpdateFailedError } from '../../common/error/errors.js';
import { type Logger, NoopLogger } from '../../common/logger/logger.js';
import { SessionState } from './session-state.js';
import { type StateChangeEvent } from './state-change-event.js';

export type SessionStateChangeHandler = (from: SessionState, to: SessionState) => void;

interface Waiter {
  target: SessionState;
  resolve: () => void;
  reject: (reason: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout> | undefined;
}

export class SessionStateMachine {
  private _current: SessionState = SessionState.IDLE;
  private _changeHandlers: Set<SessionStateChangeHandler> = new Set();
  private _waiters: Array<Waiter> = [];
  private readonly _logger: Logger;

  constructor(opts?: { logger?: Logger }) {
    this._logger = opts?.logger ?? new NoopLogger();
  }

  get current(): SessionState {
    return this._current;
  }

  transition(event: StateChangeEvent): void {
    const from = this._current;
    const to = event.to as SessionState;

    if (from === to) {
      return;
    }

    this._current = to;

    // Fire change handlers
    for (const handler of this._changeHandlers) {
      try {
        handler(from, to);
      } catch (err) {
        this._logger.error('[SessionStateMachine] onChange handler threw', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Resolve or reject waiters
    const remaining: Array<Waiter> = [];
    for (const waiter of this._waiters) {
      if (to === waiter.target) {
        if (waiter.timeoutId !== undefined) {
          clearTimeout(waiter.timeoutId);
        }
        waiter.resolve();
      } else if (to === SessionState.ERROR) {
        // Transitioning to error rejects any waiter targeting 'ready' (or any other non-error state)
        if (waiter.timeoutId !== undefined) {
          clearTimeout(waiter.timeoutId);
        }
        waiter.reject(
          new UpdateFailedError(`Update failed — state machine transitioned to 'error'`),
        );
      } else {
        remaining.push(waiter);
      }
    }
    this._waiters = remaining;
  }

  waitFor(target: SessionState, timeoutMs?: number): Promise<void> {
    if (this._current === target) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      if (timeoutMs !== undefined) {
        timeoutId = setTimeout(() => {
          // Remove this waiter from the list
          this._waiters = this._waiters.filter((w) => w.timeoutId !== timeoutId);
          reject(
            new UpdateFailedError(
              `Timed out waiting for state '${target}' (current: '${this._current}')`,
            ),
          );
        }, timeoutMs);
      }

      const waiter: Waiter = { target, resolve, reject, timeoutId };
      this._waiters.push(waiter);
    });
  }

  onChange(handler: SessionStateChangeHandler): () => void {
    this._changeHandlers.add(handler);
    return () => {
      this._changeHandlers.delete(handler);
    };
  }
}
