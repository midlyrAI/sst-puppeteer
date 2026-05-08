import { type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type RestartCommandInput, type RestartCommandOutput } from '../types/tools.js';

export class RestartCommandTool extends Tool<RestartCommandInput, RestartCommandOutput> {
  readonly name = 'restart_command';
  readonly description = 'Restart a dev command (stop if running, then start fresh).';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      commandName: { type: 'string' },
    },
    required: ['sessionId', 'commandName'],
  };

  async execute(session: SSTSession, input: RestartCommandInput): Promise<RestartCommandOutput> {
    const result = await session.restartCommand(input.commandName);
    return { status: result.status, durationMs: result.durationMs };
  }
}
