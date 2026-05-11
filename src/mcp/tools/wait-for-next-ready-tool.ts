import { type SSTSession } from '../../index.js';
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

  async execute(
    session: SSTSession,
    input: WaitForNextReadyInput,
  ): Promise<WaitForNextReadyOutput> {
    const result = await session.waitForNextReady({
      timeoutMs: input.timeoutMs,
      commandName: input.commandName,
    });
    return { state: result.state, durationMs: result.durationMs };
  }
}
