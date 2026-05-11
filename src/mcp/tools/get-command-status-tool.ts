import { type SSTSession } from '../../core/index.js';
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

  async execute(
    session: SSTSession,
    input: GetCommandStatusInput,
  ): Promise<GetCommandStatusOutput> {
    const status = session.getCommandStatus(input.commandName);
    return { status };
  }
}
