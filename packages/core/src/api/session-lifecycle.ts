import { type DeployState } from '../domain/deploy-state.js';

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
 * @throws {DeployFailedError} when a deploy enters the `'error'` terminal state.
 * @throws {StreamConnectionError} when the underlying `/stream` connection
 * is exhausted; the session transitions to `'disconnected'` and all
 * lifecycle waits reject with this error.
 */
export interface ISessionLifecycle {
  readonly id: string;
  readonly state: DeployState;
  start(): Promise<void>;
  stop(): Promise<void>;
  waitForReady(opts?: WaitOptions): Promise<{ state: DeployState; durationMs: number }>;
  waitForRedeploy(
    opts?: WaitOptions & { commandName?: string },
  ): Promise<{ state: DeployState; durationMs: number }>;
}
