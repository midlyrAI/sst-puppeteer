import { type IpcClient } from '../../session/index.js';
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

  async execute(client: IpcClient, _input: ListCommandsInput): Promise<ListCommandsOutput> {
    return (await client.call('list_commands', {})) as ListCommandsOutput;
  }
}
