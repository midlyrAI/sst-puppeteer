import { NotImplementedError, type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type ReadLogsInput, type ReadLogsOutput } from '../types/tools.js';

export class ReadLogsTool extends Tool<ReadLogsInput, ReadLogsOutput> {
  readonly name = 'read_logs';
  readonly description = 'Read recent log lines for a function in the session.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      functionName: { type: 'string' },
      since: { type: 'number' },
      limit: { type: 'number' },
    },
    required: ['sessionId', 'functionName'],
  };

  async execute(_session: SSTSession, _input: ReadLogsInput): Promise<ReadLogsOutput> {
    throw new NotImplementedError('ReadLogsTool.execute');
  }
}
