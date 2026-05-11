import { type SSTSession } from '@sst-puppeteer/core';
import { Tool, type ToolInputSchema } from './tool.js';
import { type RunSstInput, type RunSstOutput } from '../types/tools.js';

/**
 * Schema-only registration. `run_sst` is dispatched directly by
 * `McpServer._handleToolCall` because it operates on the filesystem +
 * a one-shot child process rather than an existing session, so
 * `execute` is unreachable.
 */
export class RunSstTool extends Tool<RunSstInput, RunSstOutput> {
  readonly name = 'run_sst';
  readonly description =
    'One-shot passthrough to any `sst` subcommand (deploy, remove, secrets, shell, unlock, refresh, diagnostic, etc.). Use SST_dev tools (start_session/start_command/...) for the long-running `sst dev` TUI. Args are passed verbatim — no shell interpolation.';
  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      projectDir: { type: 'string', description: 'Absolute path to the SST project root.' },
      args: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Arguments after `sst`, e.g. ["deploy"], ["unlock"], ["secrets","set","KEY","VAL"].',
      },
      stage: { type: 'string', description: 'Convenience — appends `--stage <stage>` to args.' },
      env: { type: 'object', additionalProperties: { type: 'string' } },
      timeoutMs: { type: 'number', description: 'Default 300000 (5 min).' },
      sstCommand: { type: 'string', description: "Defaults to 'sst' (must be on PATH)." },
    },
    required: ['projectDir', 'args'],
  };

  async execute(_session: SSTSession, _input: RunSstInput): Promise<RunSstOutput> {
    throw new Error('run_sst is dispatched by McpServer; execute() must not be reached');
  }
}
