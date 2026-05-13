import { type IpcClient } from '../../session/index.js';
import { Tool } from './tool.js';
import {
  WaitForNextReadyInputSchema,
  type WaitForNextReadyInput,
  type WaitForNextReadyOutput,
} from '../types/tools.js';

export class WaitForNextReadyTool extends Tool<WaitForNextReadyInput, WaitForNextReadyOutput> {
  readonly name = 'wait_for_next_ready';
  readonly description =
    'Block until the next deploy cycle (after a code edit) completes — ready or error.';
  readonly inputSchema = WaitForNextReadyInputSchema;

  async execute(client: IpcClient, input: WaitForNextReadyInput): Promise<WaitForNextReadyOutput> {
    const params: Record<string, unknown> = {};
    if (input.timeoutMs !== undefined) params['timeoutMs'] = input.timeoutMs;
    if (input.commandName !== undefined) params['commandName'] = input.commandName;
    return (await client.call('wait_for_next_ready', params)) as WaitForNextReadyOutput;
  }
}
