import { type IpcClient } from '../../../shared/src/session/index.js';
import { Tool } from './tool.js';
import {
  ListSessionsInputSchema,
  type ListSessionsInput,
  type ListSessionsOutput,
} from '../types/tools.js';

/**
 * Schema-only registration. `list_sessions` is dispatched directly by
 * `McpServer._handleToolCall` because it delegates to the shared
 * `SessionManager.list()` (on-disk records) rather than acting on a single
 * connected session, so `execute` is unreachable.
 */
export class ListSessionsTool extends Tool<ListSessionsInput, ListSessionsOutput> {
  readonly name = 'list_sessions';
  readonly description =
    'List all sessions tracked on disk (shared file-based store; survives MCP restart).';
  readonly inputSchema = ListSessionsInputSchema;

  async execute(_client: IpcClient, _input: ListSessionsInput): Promise<ListSessionsOutput> {
    throw new Error('list_sessions is dispatched by McpServer; execute() must not be reached');
  }
}
