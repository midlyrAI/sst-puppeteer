import { z } from 'zod';
import {
  type Command,
  type CommandSpec,
  type CommandStatus,
  type SessionState,
} from '@sst-puppeteer/core';

export const TOOL_NAMES = [
  'start_session',
  'list_sessions',
  'wait_for_ready',
  'list_commands',
  'get_command_status',
  'start_command',
  'restart_command',
  'stop_command',
  'read_command_logs',
  'wait_for_next_ready',
  'stop_session',
  'run_sst',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

// ─── Input schemas ───────────────────────────────────────────────────────────
// Zod is the single source of truth for MCP tool inputs. `z.toJSONSchema` on
// each schema produces the `inputSchema` we advertise via `tools/list`, and
// `z.infer<typeof X>` derives the TypeScript type used internally.

// Mirrors `CommandSpec` from core. Kept structural to avoid runtime coupling —
// the host sends raw JSON, we validate it matches the contract.
const CommandSpecSchema: z.ZodType<CommandSpec> = z.object({
  name: z.string(),
  kind: z.enum(['service', 'task', 'tunnel', 'function-host']),
  command: z.string(),
  directory: z.string().optional(),
  environment: z.record(z.string(), z.string()).optional(),
  autostart: z.boolean(),
  link: z.array(z.string()).optional(),
  killable: z.boolean(),
});

export const StartSessionInputSchema = z.object({
  projectDir: z.string(),
  awsProfile: z.string().optional(),
  awsRegion: z.string().optional(),
  stage: z.string().optional(),
  commands: z.array(CommandSpecSchema).optional(),
  sstCommand: z.string().optional(),
  sstCommandArgs: z.array(z.string()).optional(),
  extraDevArgs: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});
export type StartSessionInput = z.infer<typeof StartSessionInputSchema>;

export const ListSessionsInputSchema = z.object({});
export type ListSessionsInput = z.infer<typeof ListSessionsInputSchema>;

export const WaitForReadyInputSchema = z.object({
  sessionId: z.string(),
  timeoutMs: z.number().optional(),
});
export type WaitForReadyInput = z.infer<typeof WaitForReadyInputSchema>;

export const ListCommandsInputSchema = z.object({
  sessionId: z.string(),
});
export type ListCommandsInput = z.infer<typeof ListCommandsInputSchema>;

export const GetCommandStatusInputSchema = z.object({
  sessionId: z.string(),
  commandName: z.string(),
});
export type GetCommandStatusInput = z.infer<typeof GetCommandStatusInputSchema>;

export const StartCommandInputSchema = z.object({
  sessionId: z.string(),
  commandName: z.string(),
});
export type StartCommandInput = z.infer<typeof StartCommandInputSchema>;

export const RestartCommandInputSchema = z.object({
  sessionId: z.string(),
  commandName: z.string(),
});
export type RestartCommandInput = z.infer<typeof RestartCommandInputSchema>;

export const StopCommandInputSchema = z.object({
  sessionId: z.string(),
  commandName: z.string(),
});
export type StopCommandInput = z.infer<typeof StopCommandInputSchema>;

export const ReadCommandLogsInputSchema = z.object({
  sessionId: z.string(),
  commandName: z.string(),
  since: z.number().optional(),
  limit: z.number().optional(),
});
export type ReadCommandLogsInput = z.infer<typeof ReadCommandLogsInputSchema>;

export const WaitForNextReadyInputSchema = z.object({
  sessionId: z.string(),
  timeoutMs: z.number().optional(),
  commandName: z.string().optional(),
});
export type WaitForNextReadyInput = z.infer<typeof WaitForNextReadyInputSchema>;

export const StopSessionInputSchema = z.object({
  sessionId: z.string(),
});
export type StopSessionInput = z.infer<typeof StopSessionInputSchema>;

export const RunSstInputSchema = z.object({
  projectDir: z.string(),
  args: z.array(z.string()),
  stage: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().optional(),
  sstCommand: z.string().optional(),
});
export type RunSstInput = z.infer<typeof RunSstInputSchema>;

// ─── Output types ────────────────────────────────────────────────────────────
// Outputs are computed locally and serialized back to the host — no runtime
// validation needed, so they stay as plain TS interfaces that reference core
// types directly (single source of truth for domain shapes).

export interface StartSessionOutput {
  readonly sessionId: string;
}

export interface SessionSummary {
  readonly sessionId: string;
  readonly projectDir: string;
  readonly stage?: string;
  readonly state: SessionState;
  readonly startedAt: number;
}
export interface ListSessionsOutput {
  readonly sessions: readonly SessionSummary[];
}

export interface WaitForReadyOutput {
  readonly state: SessionState;
  readonly durationMs: number;
}

export interface ListCommandsOutput {
  readonly commands: readonly Command[];
}

export interface GetCommandStatusOutput {
  readonly status: CommandStatus;
}

export interface StartCommandOutput {
  readonly status: 'running';
  readonly durationMs: number;
}

export interface RestartCommandOutput {
  readonly status: 'running';
  readonly durationMs: number;
}

export interface StopCommandOutput {
  readonly status: 'stopped';
}

export interface ReadCommandLogsOutput {
  readonly lines: readonly string[];
}

export interface WaitForNextReadyOutput {
  readonly state: SessionState;
  readonly durationMs: number;
}

export interface StopSessionOutput {
  readonly stopped: true;
}

export interface RunSstOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly durationMs: number;
  readonly timedOut: boolean;
}
