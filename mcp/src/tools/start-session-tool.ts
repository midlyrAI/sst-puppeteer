import { type IpcClient } from '../../../shared/src/session/index.js';
import { Tool } from './tool.js';
import {
  StartSessionInputSchema,
  type StartSessionInput,
  type StartSessionOutput,
} from '../types/tools.js';

/**
 * Schema-only registration. `start_session` is dispatched directly by
 * `McpServer._handleToolCall` because it creates the session (rather than
 * acting on an existing one), so `execute` is unreachable in production.
 */
export class StartSessionTool extends Tool<StartSessionInput, StartSessionOutput> {
  readonly name = 'start_session';
  readonly description = 'Spawn `sst dev` in the target project directory and return a session id.';
  readonly inputSchema = StartSessionInputSchema;

  async execute(_client: IpcClient, _input: StartSessionInput): Promise<StartSessionOutput> {
    throw new Error('start_session is dispatched by McpServer; execute() must not be reached');
  }
}
