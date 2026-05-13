import { type IpcClient } from '../../session/index.js';
import { Tool } from './tool.js';
import {
  WaitForReadyInputSchema,
  type WaitForReadyInput,
  type WaitForReadyOutput,
} from '../types/tools.js';

export class WaitForReadyTool extends Tool<WaitForReadyInput, WaitForReadyOutput> {
  readonly name = 'wait_for_ready';
  readonly description = 'Block until the initial deploy of the session reaches the ready state.';
  readonly inputSchema = WaitForReadyInputSchema;

  async execute(client: IpcClient, input: WaitForReadyInput): Promise<WaitForReadyOutput> {
    const params: Record<string, unknown> = {};
    if (input.timeoutMs !== undefined) params['timeoutMs'] = input.timeoutMs;
    return (await client.call('wait_for_ready', params)) as WaitForReadyOutput;
  }
}
