import { type IpcClient } from '../../session/index.js';
import { Tool } from './tool.js';
import {
  ReadCommandLogsInputSchema,
  type ReadCommandLogsInput,
  type ReadCommandLogsOutput,
} from '../types/tools.js';

export class ReadCommandLogsTool extends Tool<ReadCommandLogsInput, ReadCommandLogsOutput> {
  readonly name = 'read_command_logs';
  readonly description = 'Read recent log lines from a dev command process.';
  readonly inputSchema = ReadCommandLogsInputSchema;

  async execute(client: IpcClient, input: ReadCommandLogsInput): Promise<ReadCommandLogsOutput> {
    const params: Record<string, unknown> = { commandName: input.commandName };
    if (input.since !== undefined) params['since'] = input.since;
    if (input.limit !== undefined) params['limit'] = input.limit;
    return (await client.call('read_command_logs', params)) as ReadCommandLogsOutput;
  }
}
