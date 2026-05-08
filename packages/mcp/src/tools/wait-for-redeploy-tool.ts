import { type SSTSession } from '@sst-puppeteer/core';
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
      timeoutMs: { type: 'number' },
      commandName: { type: 'string' },
    },
    required: ['sessionId'],
  };

  async execute(session: SSTSession, input: WaitForRedeployInput): Promise<WaitForRedeployOutput> {
    const result = await session.waitForRedeploy({
      timeoutMs: input.timeoutMs,
      commandName: input.commandName,
    });
    return { state: result.state, durationMs: result.durationMs };
  }
}
