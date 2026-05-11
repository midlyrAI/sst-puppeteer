import { type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type GetCommandStatusInput, type GetCommandStatusOutput } from '../types/tools.js';

export class GetCommandStatusTool extends Tool<GetCommandStatusInput, GetCommandStatusOutput> {
  readonly name = 'get_command_status';
  readonly description = 'Get the current status of a dev command by name.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      commandName: { type: 'string' },
    },
    required: ['sessionId', 'commandName'],
  };

  async execute(
    session: SSTSession,
    input: GetCommandStatusInput,
  ): Promise<GetCommandStatusOutput> {
    const status = session.getCommandStatus(input.commandName);
    return { status };
  }
}
