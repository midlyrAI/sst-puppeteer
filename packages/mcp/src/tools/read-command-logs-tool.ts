import { type SSTSession } from '@sst-puppeteer/core';
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

  async execute(session: SSTSession, input: ReadCommandLogsInput): Promise<ReadCommandLogsOutput> {
    const lines = await session.readCommandLogs({
      commandName: input.commandName,
      since: input.since,
      limit: input.limit,
    });
    return { lines: [...lines] };
  }
}
