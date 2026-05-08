/**
 * Per-command lifecycle controls — start, stop, restart.
 *
 * @example
 * ```ts
 * await session.startCommand('Service-Web');
 * await session.stopCommand('Service-Web');
 * ```
 *
 * @throws {CommandNotFoundError} when `name` is not registered.
 * @throws {CommandAlreadyRunningError} from `startCommand` when status is `'running'` or `'starting'`.
 * @throws {CommandNotRunningError} from `stopCommand` when status is not `'running'` or `'starting'`.
 * @throws {StreamConnectionError} when the session is in `'disconnected'` state.
 */
export interface ICommandLifecycle {
  startCommand(name: string): Promise<{ status: 'running'; durationMs: number }>;
  restartCommand(name: string): Promise<{ status: 'running'; durationMs: number }>;
  stopCommand(name: string): Promise<{ status: 'stopped' }>;
}
