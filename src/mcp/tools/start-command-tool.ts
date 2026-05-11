import { type SSTSession } from '../../index.js';
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

  async execute(session: SSTSession, input: StartCommandInput): Promise<StartCommandOutput> {
    const result = await session.startCommand(input.commandName);
    return { status: result.status, durationMs: result.durationMs };
  }
}
