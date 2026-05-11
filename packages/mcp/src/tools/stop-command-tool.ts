import { type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type StopCommandInput, type StopCommandOutput } from '../types/tools.js';

export class StopCommandTool extends Tool<StopCommandInput, StopCommandOutput> {
  readonly name = 'stop_command';
  readonly description = 'Stop a running dev command.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      commandName: { type: 'string' },
    },
    required: ['sessionId', 'commandName'],
  };

  async execute(session: SSTSession, input: StopCommandInput): Promise<StopCommandOutput> {
    const result = await session.stopCommand(input.commandName);
    return { status: result.status };
  }
}
