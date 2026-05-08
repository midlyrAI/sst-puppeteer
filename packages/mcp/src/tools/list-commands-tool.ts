import { type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type ListCommandsInput, type ListCommandsOutput } from '../types/tools.js';

export class ListCommandsTool extends Tool<ListCommandsInput, ListCommandsOutput> {
  readonly name = 'list_commands';
  readonly description = 'List all dev commands registered for the session.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
    },
    required: ['sessionId'],
  };

  async execute(session: SSTSession, _input: ListCommandsInput): Promise<ListCommandsOutput> {
    const commands = session.listCommands();
    return { commands };
  }
}
