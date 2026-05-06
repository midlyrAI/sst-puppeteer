import { NotImplementedError, type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type WaitForReadyInput, type WaitForReadyOutput } from '../types/tools.js';

export class WaitForReadyTool extends Tool<WaitForReadyInput, WaitForReadyOutput> {
  readonly name = 'wait_for_ready';
  readonly description = 'Block until the initial deploy of the session reaches the ready state.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      timeoutMs: { type: 'number' },
    },
    required: ['sessionId'],
  };

  async execute(_session: SSTSession, _input: WaitForReadyInput): Promise<WaitForReadyOutput> {
    throw new NotImplementedError('WaitForReadyTool.execute');
  }
}
