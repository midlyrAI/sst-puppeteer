import { type IpcClient } from '../../../shared/src/session/index.js';
import { Tool } from './tool.js';
import {
  StopSessionInputSchema,
  type StopSessionInput,
  type StopSessionOutput,
} from '../types/tools.js';

/**
 * Schema-only registration. `stop_session` is dispatched directly by
 * `McpServer._handleToolCall` via `SessionManager.stop(sessionId)`, which
 * tears down the daemon + cleans up the on-disk session dir. `execute` is
 * unreachable in production.
 */
export class StopSessionTool extends Tool<StopSessionInput, StopSessionOutput> {
  readonly name = 'stop_session';
  readonly description = 'Gracefully shut down the session (kills sst dev, releases resources).';
  readonly inputSchema = StopSessionInputSchema;

  async execute(_client: IpcClient, _input: StopSessionInput): Promise<StopSessionOutput> {
    throw new Error('stop_session is dispatched by McpServer; execute() must not be reached');
  }
}
