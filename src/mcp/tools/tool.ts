import { type SSTSession } from '../../index.js';
import { type ZodType } from 'zod';

/**
 * Base class for all MCP tools. `inputSchema` is a Zod schema — the canonical
 * source of truth for both the wire-level JSON Schema (converted once at the
 * protocol boundary in `McpServer`) and the TypeScript input type (derived
 * via `z.infer` in `types/tools.ts`).
 */
export abstract class Tool<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: ZodType<TInput>;
  abstract execute(session: SSTSession, input: TInput): Promise<TOutput>;
}
