import { type IpcClient } from '../../session/index.js';
import { Tool } from './tool.js';
import {
  StopCommandInputSchema,
  type StopCommandInput,
  type StopCommandOutput,
} from '../types/tools.js';

export class StopCommandTool extends Tool<StopCommandInput, StopCommandOutput> {
  readonly name = 'stop_command';
  readonly description = 'Stop a running dev command.';
  readonly inputSchema = StopCommandInputSchema;

  async execute(client: IpcClient, input: StopCommandInput): Promise<StopCommandOutput> {
    return (await client.call('stop_command', {
      commandName: input.commandName,
    })) as StopCommandOutput;
  }
}
