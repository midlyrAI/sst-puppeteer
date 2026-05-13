import { type IpcClient } from '../../../shared/src/session/index.js';
import { type ZodType } from 'zod';

/**
 * Base class for all MCP tools. `inputSchema` is a Zod schema — the canonical
 * source of truth for both the wire-level JSON Schema (converted once at the
 * protocol boundary in `McpServer`) and the TypeScript input type (derived
 * via `z.infer` in `types/tools.ts`).
 *
 * `execute` receives a session-scoped `IpcClient` (already connected by the
 * server). Tool bodies translate input → wire-method call. The base class
 * has no knowledge of the daemon's `SSTSession`.
 */
export abstract class Tool<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: ZodType<TInput>;
  abstract execute(client: IpcClient, input: TInput): Promise<TOutput>;
}
