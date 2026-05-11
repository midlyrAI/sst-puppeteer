import { type SSTSession } from '@sst-puppeteer/core';
import { Tool, zodToToolInputSchema } from './tool.js';
import {
  ListCommandsInputSchema,
  type ListCommandsInput,
  type ListCommandsOutput,
} from '../types/tools.js';

export class ListCommandsTool extends Tool<ListCommandsInput, ListCommandsOutput> {
  readonly name = 'list_commands';
  readonly description = 'List all dev commands registered for the session.';
  readonly inputSchema = zodToToolInputSchema(ListCommandsInputSchema);

  async execute(session: SSTSession, _input: ListCommandsInput): Promise<ListCommandsOutput> {
    const commands = session.listCommands();
    return { commands };
  }
}
