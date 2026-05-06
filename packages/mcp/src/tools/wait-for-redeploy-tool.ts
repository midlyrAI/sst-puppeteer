import { NotImplementedError, type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type WaitForRedeployInput, type WaitForRedeployOutput } from '../types/tools.js';

export class WaitForRedeployTool extends Tool<WaitForRedeployInput, WaitForRedeployOutput> {
  readonly name = 'wait_for_redeploy';
  readonly description =
    'Block until the next deploy cycle (after a code edit) completes — ready or error.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      since: { type: 'number' },
      timeoutMs: { type: 'number' },
    },
    required: ['sessionId'],
  };

  async execute(
    _session: SSTSession,
    _input: WaitForRedeployInput,
  ): Promise<WaitForRedeployOutput> {
    throw new NotImplementedError('WaitForRedeployTool.execute');
  }
}
