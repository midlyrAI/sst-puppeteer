import { type SSTSession } from '../../index.js';
import { Tool } from './tool.js';
import {
  ListSessionsInputSchema,
  type ListSessionsInput,
  type ListSessionsOutput,
} from '../types/tools.js';

/**
 * Schema-only registration. `list_sessions` is dispatched directly by
 * `McpServer._handleToolCall` because it operates on the server-wide
 * session map rather than a single session, so `execute` is unreachable.
 */
export class ListSessionsTool extends Tool<ListSessionsInput, ListSessionsOutput> {
  readonly name = 'list_sessions';
  readonly description =
    'List all sessions currently tracked by this MCP server (in-memory only — does not survive restart).';
  readonly inputSchema = ListSessionsInputSchema;

  async execute(_session: SSTSession, _input: ListSessionsInput): Promise<ListSessionsOutput> {
    throw new Error('list_sessions is dispatched by McpServer; execute() must not be reached');
  }
}
