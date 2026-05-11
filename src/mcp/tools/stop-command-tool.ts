import { type SSTSession } from '../../core/index.js';
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

  async execute(session: SSTSession, input: StopCommandInput): Promise<StopCommandOutput> {
    const result = await session.stopCommand(input.commandName);
    return { status: result.status };
  }
}
