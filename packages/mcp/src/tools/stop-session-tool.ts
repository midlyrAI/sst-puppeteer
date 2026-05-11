import { type SSTSession } from '@sst-puppeteer/core';
import { Tool } from './tool.js';
import {
  StopSessionInputSchema,
  type StopSessionInput,
  type StopSessionOutput,
} from '../types/tools.js';

export class StopSessionTool extends Tool<StopSessionInput, StopSessionOutput> {
  readonly name = 'stop_session';
  readonly description = 'Gracefully shut down the session (kills sst dev, releases resources).';
  readonly inputSchema = StopSessionInputSchema;

  async execute(session: SSTSession, _input: StopSessionInput): Promise<StopSessionOutput> {
    await session.stop();
    return { stopped: true };
  }
}
