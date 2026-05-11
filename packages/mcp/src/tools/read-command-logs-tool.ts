import { type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type ReadCommandLogsInput, type ReadCommandLogsOutput } from '../types/tools.js';

export class ReadCommandLogsTool extends Tool<ReadCommandLogsInput, ReadCommandLogsOutput> {
  readonly name = 'read_command_logs';
  readonly description = 'Read recent log lines from a dev command process.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      commandName: { type: 'string' },
      since: { type: 'number' },
      limit: { type: 'number' },
    },
    required: ['sessionId', 'commandName'],
  };

  async execute(session: SSTSession, input: ReadCommandLogsInput): Promise<ReadCommandLogsOutput> {
    const lines = await session.readCommandLogs({
      commandName: input.commandName,
      since: input.since,
      limit: input.limit,
    });
    return { lines };
  }
}
