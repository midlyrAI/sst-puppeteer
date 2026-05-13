import { type IpcClient } from '../../../shared/src/session/index.js';
import { Tool } from './tool.js';
import {
  GetCommandStatusInputSchema,
  type GetCommandStatusInput,
  type GetCommandStatusOutput,
} from '../types/tools.js';

export class GetCommandStatusTool extends Tool<GetCommandStatusInput, GetCommandStatusOutput> {
  readonly name = 'get_command_status';
  readonly description = 'Get the current status of a dev command by name.';
  readonly inputSchema = GetCommandStatusInputSchema;

  async execute(client: IpcClient, input: GetCommandStatusInput): Promise<GetCommandStatusOutput> {
    return (await client.call('get_command_status', {
      commandName: input.commandName,
    })) as GetCommandStatusOutput;
  }
}
