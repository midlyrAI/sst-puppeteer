import { NotImplementedError, type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type StartSessionInput, type StartSessionOutput } from '../types/tools.js';

export class StartSessionTool extends Tool<StartSessionInput, StartSessionOutput> {
  readonly name = 'start_session';
  readonly description = 'Spawn `sst dev` in the target project directory and return a session id.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      projectDir: { type: 'string' },
      awsProfile: { type: 'string' },
    },
    required: ['projectDir'],
  };

  async execute(_session: SSTSession, _input: StartSessionInput): Promise<StartSessionOutput> {
    throw new NotImplementedError('StartSessionTool.execute');
  }
}
