import { type SSTSession } from '@sst-puppeteer/core';
import { Tool, zodToToolInputSchema } from './tool.js';
import {
  GetCommandStatusInputSchema,
  type GetCommandStatusInput,
  type GetCommandStatusOutput,
} from '../types/tools.js';

export class GetCommandStatusTool extends Tool<GetCommandStatusInput, GetCommandStatusOutput> {
  readonly name = 'get_command_status';
  readonly description = 'Get the current status of a dev command by name.';
  readonly inputSchema = zodToToolInputSchema(GetCommandStatusInputSchema);

  async execute(
    session: SSTSession,
    input: GetCommandStatusInput,
  ): Promise<GetCommandStatusOutput> {
    const status = session.getCommandStatus(input.commandName);
    return { status };
  }
}
