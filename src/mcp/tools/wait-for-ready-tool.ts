import { type SSTSession } from '../../core/index.js';
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

  async execute(session: SSTSession, input: WaitForReadyInput): Promise<WaitForReadyOutput> {
    const result = await session.waitForReady({ timeoutMs: input.timeoutMs });
    return { state: result.state, durationMs: result.durationMs };
  }
}
