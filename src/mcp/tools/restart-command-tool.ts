import { type IpcClient } from '../../session/index.js';
import { Tool } from './tool.js';
import {
  RestartCommandInputSchema,
  type RestartCommandInput,
  type RestartCommandOutput,
} from '../types/tools.js';

export class RestartCommandTool extends Tool<RestartCommandInput, RestartCommandOutput> {
  readonly name = 'restart_command';
  readonly description = 'Restart a dev command (stop if running, then start fresh).';
  readonly inputSchema = RestartCommandInputSchema;

  async execute(client: IpcClient, input: RestartCommandInput): Promise<RestartCommandOutput> {
    return (await client.call('restart_command', {
      commandName: input.commandName,
    })) as RestartCommandOutput;
  }
}
