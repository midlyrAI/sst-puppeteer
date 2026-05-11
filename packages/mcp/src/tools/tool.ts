import { type SSTSession } from '@sst-puppeteer/core';
import { type ZodType, toJSONSchema } from 'zod';

export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
}

/**
 * Convert a Zod schema into the JSON Schema shape the MCP host expects.
 * Zod emits a `$schema` field by default and may emit `additionalProperties:
 * false` — both are valid JSON Schema but noisy for our use; we strip them.
 */
export function zodToToolInputSchema(schema: ZodType): ToolInputSchema {
  const json = toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  delete json['$schema'];
  delete json['additionalProperties'];
  return json as unknown as ToolInputSchema;
}

export abstract class Tool<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: ToolInputSchema;
  abstract execute(session: SSTSession, input: TInput): Promise<TOutput>;
}
