import { type SessionState } from '../domain/session-state.js';

export interface WaitOptions {
  readonly timeoutMs?: number;
}

/**
 * Lifecycle of an SST session — start, ready-gate, redeploy-gate, and stop.
 *
 * @example
 * ```ts
 * const session: ISessionLifecycle = builder.build();
 * await session.start();
 * await session.waitForReady({ timeoutMs: 5 * 60_000 });
 * // ... do work ...
 * await session.stop();
 * ```
 *
 * @throws {UpdateFailedError} when a deploy enters the `'error'` terminal state.
 * @throws {StreamConnectionError} when the underlying `/stream` connection
 * is exhausted; the session transitions to `'disconnected'` and all
 * lifecycle waits reject with this error.
 */
export interface ISessionLifecycle {
  readonly id: string;
  readonly state: SessionState;
  start(): Promise<void>;
  stop(): Promise<void>;
  waitForReady(opts?: WaitOptions): Promise<{ state: SessionState; durationMs: number }>;
  waitForNextReady(
    opts?: WaitOptions & { commandName?: string },
  ): Promise<{ state: SessionState; durationMs: number }>;
}
