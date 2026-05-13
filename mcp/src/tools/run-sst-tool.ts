import { type IpcClient } from '../../../shared/src/session/index.js';
import { Tool } from './tool.js';
import { RunSstInputSchema, type RunSstInput, type RunSstOutput } from '../types/tools.js';

/**
 * Schema-only registration. `run_sst` is dispatched directly by
 * `McpServer._handleToolCall` because it operates on the filesystem +
 * a one-shot child process rather than an existing session, so
 * `execute` is unreachable.
 */
export class RunSstTool extends Tool<RunSstInput, RunSstOutput> {
  readonly name = 'run_sst';
  readonly description =
    'One-shot passthrough to any `sst` subcommand (deploy, remove, secrets, shell, unlock, refresh, diagnostic, etc.). Use the sst dev tools (start_session/start_command/...) for the long-running `sst dev` TUI. Args are passed verbatim — no shell interpolation.';
  readonly inputSchema = RunSstInputSchema;

  async execute(_client: IpcClient, _input: RunSstInput): Promise<RunSstOutput> {
    throw new Error('run_sst is dispatched by McpServer; execute() must not be reached');
  }
}
