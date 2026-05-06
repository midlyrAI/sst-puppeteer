import { NotImplementedError, type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type InvokeFunctionInput, type InvokeFunctionOutput } from '../types/tools.js';

export class InvokeFunctionTool extends Tool<InvokeFunctionInput, InvokeFunctionOutput> {
  readonly name = 'invoke_function';
  readonly description = 'Invoke a deployed Lambda by name with a JSON payload.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      functionName: { type: 'string' },
      payload: {},
    },
    required: ['sessionId', 'functionName', 'payload'],
  };

  async execute(_session: SSTSession, _input: InvokeFunctionInput): Promise<InvokeFunctionOutput> {
    throw new NotImplementedError('InvokeFunctionTool.execute');
  }
}
