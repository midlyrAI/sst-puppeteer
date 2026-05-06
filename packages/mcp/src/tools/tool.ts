import { type SSTSession } from '@sst-puppeteer/core';

export interface ToolInputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
}

export abstract class Tool<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly inputSchema: ToolInputSchema;
  abstract execute(session: SSTSession, input: TInput): Promise<TOutput>;
}
