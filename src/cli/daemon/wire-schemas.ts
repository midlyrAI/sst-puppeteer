import { z } from 'zod';
import {
  CommandSchema,
  CommandStatus,
  CommandStatusSchema,
  SessionStateSchema,
} from '../../core/index.js';

// ─── Daemon-side per-method param schemas ────────────────────────────────────
// sessionId is implicit on the IPC channel — the daemon process is bound to a
// single session, so each method's params omit it entirely.

export const DaemonWaitForReadyParamsSchema = z.object({
  timeoutMs: z.number().optional(),
});

export const DaemonWaitForNextReadyParamsSchema = z.object({
  timeoutMs: z.number().optional(),
  commandName: z.string().optional(),
});

export const DaemonListCommandsParamsSchema = z.object({});

export const DaemonGetCommandStatusParamsSchema = z.object({
  commandName: z.string(),
});

export const DaemonStartCommandParamsSchema = z.object({
  commandName: z.string(),
});

export const DaemonStopCommandParamsSchema = z.object({
  commandName: z.string(),
});

export const DaemonRestartCommandParamsSchema = z.object({
  commandName: z.string(),
});

export const DaemonReadCommandLogsParamsSchema = z.object({
  commandName: z.string(),
  since: z.number().optional(),
  limit: z.number().optional(),
});

export const DaemonStopSessionParamsSchema = z.object({});

// ─── CLI-owned per-method output schemas ─────────────────────────────────────
// Each CLI command parses the daemon's raw response against these. Shapes
// mirror what SSTSession's methods (and the daemon's response wrappers in
// ipc-server.ts) actually return.

// status: 'running' for long-lived services; 'stopped' when the command is a
// run-to-completion task (e.g. a DB migration) that exited cleanly before our
// state machine ever observed it as 'running'. Both are success.
const StartedTerminalStatusSchema = z.enum([CommandStatus.RUNNING, CommandStatus.STOPPED]);

export const CliWaitForReadyOutputSchema = z.object({
  state: SessionStateSchema,
  durationMs: z.number(),
});

export const CliWaitForNextReadyOutputSchema = z.object({
  state: SessionStateSchema,
  durationMs: z.number(),
});

export const CliListCommandsOutputSchema = z.object({
  commands: z.array(CommandSchema),
});

export const CliGetCommandStatusOutputSchema = z.object({
  status: CommandStatusSchema,
});

export const CliStartCommandOutputSchema = z.object({
  status: StartedTerminalStatusSchema,
  durationMs: z.number(),
});

export const CliRestartCommandOutputSchema = z.object({
  status: StartedTerminalStatusSchema,
  durationMs: z.number(),
});

export const CliStopCommandOutputSchema = z.object({
  status: z.literal(CommandStatus.STOPPED),
});

export const CliReadCommandLogsOutputSchema = z.object({
  lines: z.array(z.string()),
});

export const CliRunSstOutputSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  durationMs: z.number(),
  timedOut: z.boolean(),
});
