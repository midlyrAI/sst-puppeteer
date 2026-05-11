import { type SSTSession } from '../../core/index.js';
import { Tool } from './tool.js';
import {
  ListCommandsInputSchema,
  type ListCommandsInput,
  type ListCommandsOutput,
} from '../types/tools.js';

export class ListCommandsTool extends Tool<ListCommandsInput, ListCommandsOutput> {
  readonly name = 'list_commands';
  readonly description = 'List all dev commands registered for the session.';
  readonly inputSchema = ListCommandsInputSchema;

  async execute(session: SSTSession, _input: ListCommandsInput): Promise<ListCommandsOutput> {
    return { commands: [...session.listCommands()] };
  }
}
