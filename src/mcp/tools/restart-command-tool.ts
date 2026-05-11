import { type SSTSession } from '../../core/index.js';
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

  async execute(session: SSTSession, input: RestartCommandInput): Promise<RestartCommandOutput> {
    const result = await session.restartCommand(input.commandName);
    return { status: result.status, durationMs: result.durationMs };
  }
}
