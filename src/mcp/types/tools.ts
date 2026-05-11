import { z } from 'zod';
import {
  CommandSchema,
  CommandSpecSchema,
  CommandStatus,
  CommandStatusSchema,
  SessionStateSchema,
} from '../../index.js';

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
export const ToolNameSchema = z.enum(TOOL_NAMES);
export type ToolName = z.infer<typeof ToolNameSchema>;

// ─── Inputs ──────────────────────────────────────────────────────────────────

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

// ─── Outputs ─────────────────────────────────────────────────────────────────

export const StartSessionOutputSchema = z.object({
  sessionId: z.string(),
});
export type StartSessionOutput = z.infer<typeof StartSessionOutputSchema>;

export const SessionSummarySchema = z.object({
  sessionId: z.string(),
  projectDir: z.string(),
  stage: z.string().optional(),
  state: SessionStateSchema,
  startedAt: z.number(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const ListSessionsOutputSchema = z.object({
  sessions: z.array(SessionSummarySchema),
});
export type ListSessionsOutput = z.infer<typeof ListSessionsOutputSchema>;

export const WaitForReadyOutputSchema = z.object({
  state: SessionStateSchema,
  durationMs: z.number(),
});
export type WaitForReadyOutput = z.infer<typeof WaitForReadyOutputSchema>;

export const ListCommandsOutputSchema = z.object({
  commands: z.array(CommandSchema),
});
export type ListCommandsOutput = z.infer<typeof ListCommandsOutputSchema>;

export const GetCommandStatusOutputSchema = z.object({
  status: CommandStatusSchema,
});
export type GetCommandStatusOutput = z.infer<typeof GetCommandStatusOutputSchema>;

// status: 'running' for long-lived services; 'stopped' when the command
// is a run-to-completion task (e.g. a DB migration) that exited cleanly
// before our state machine ever observed it as 'running'. Both are success.
const StartedTerminalStatusSchema = z.enum([CommandStatus.RUNNING, CommandStatus.STOPPED]);

export const StartCommandOutputSchema = z.object({
  status: StartedTerminalStatusSchema,
  durationMs: z.number(),
});
export type StartCommandOutput = z.infer<typeof StartCommandOutputSchema>;

export const RestartCommandOutputSchema = z.object({
  status: StartedTerminalStatusSchema,
  durationMs: z.number(),
});
export type RestartCommandOutput = z.infer<typeof RestartCommandOutputSchema>;

export const StopCommandOutputSchema = z.object({
  status: z.literal(CommandStatus.STOPPED),
});
export type StopCommandOutput = z.infer<typeof StopCommandOutputSchema>;

export const ReadCommandLogsOutputSchema = z.object({
  lines: z.array(z.string()),
});
export type ReadCommandLogsOutput = z.infer<typeof ReadCommandLogsOutputSchema>;

export const WaitForNextReadyOutputSchema = z.object({
  state: SessionStateSchema,
  durationMs: z.number(),
});
export type WaitForNextReadyOutput = z.infer<typeof WaitForNextReadyOutputSchema>;

export const StopSessionOutputSchema = z.object({
  stopped: z.literal(true),
});
export type StopSessionOutput = z.infer<typeof StopSessionOutputSchema>;

export const RunSstOutputSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  durationMs: z.number(),
  timedOut: z.boolean(),
});
export type RunSstOutput = z.infer<typeof RunSstOutputSchema>;
