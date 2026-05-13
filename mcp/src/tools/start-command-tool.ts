import { type IpcClient } from '../../../shared/src/session/index.js';
import { Tool } from './tool.js';
import {
  StartCommandInputSchema,
  type StartCommandInput,
  type StartCommandOutput,
} from '../types/tools.js';

export class StartCommandTool extends Tool<StartCommandInput, StartCommandOutput> {
  readonly name = 'start_command';
  readonly description = 'Start a dev command that is not currently running.';
  readonly inputSchema = StartCommandInputSchema;

  async execute(client: IpcClient, input: StartCommandInput): Promise<StartCommandOutput> {
    return (await client.call('start_command', {
      commandName: input.commandName,
    })) as StartCommandOutput;
  }
}
