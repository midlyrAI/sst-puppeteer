import { type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type StartCommandInput, type StartCommandOutput } from '../types/tools.js';

export class StartCommandTool extends Tool<StartCommandInput, StartCommandOutput> {
  readonly name = 'start_command';
  readonly description = 'Start a dev command that is not currently running.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      commandName: { type: 'string' },
    },
    required: ['sessionId', 'commandName'],
  };

  async execute(session: SSTSession, input: StartCommandInput): Promise<StartCommandOutput> {
    const result = await session.startCommand(input.commandName);
    return { status: result.status, durationMs: result.durationMs };
  }
}
