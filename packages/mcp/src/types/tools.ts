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
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface StartSessionInput {
  readonly projectDir: string;
  readonly awsProfile?: string;
  readonly awsRegion?: string;
  readonly stage?: string;
  readonly commands?: readonly CommandSpec[];
  readonly sstCommand?: string;
  readonly sstCommandArgs?: readonly string[];
  readonly extraDevArgs?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}
export interface StartSessionOutput {
  readonly sessionId: string;
}

export interface WaitForReadyInput {
  readonly sessionId: string;
  readonly timeoutMs?: number;
}
export interface WaitForReadyOutput {
  readonly state: SessionState;
  readonly durationMs: number;
}

export interface ListCommandsInput {
  readonly sessionId: string;
}
export interface ListCommandsOutput {
  readonly commands: readonly Command[];
}

export interface GetCommandStatusInput {
  readonly sessionId: string;
  readonly commandName: string;
}
export interface GetCommandStatusOutput {
  readonly status: CommandStatus;
}

export interface StartCommandInput {
  readonly sessionId: string;
  readonly commandName: string;
}
export interface StartCommandOutput {
  readonly status: 'running';
  readonly durationMs: number;
}

export interface RestartCommandInput {
  readonly sessionId: string;
  readonly commandName: string;
}
export interface RestartCommandOutput {
  readonly status: 'running';
  readonly durationMs: number;
}

export interface StopCommandInput {
  readonly sessionId: string;
  readonly commandName: string;
}
export interface StopCommandOutput {
  readonly status: 'stopped';
}

export interface ReadCommandLogsInput {
  readonly sessionId: string;
  readonly commandName: string;
  readonly since?: number;
  readonly limit?: number;
}
export interface ReadCommandLogsOutput {
  readonly lines: readonly string[];
}

export interface WaitForNextReadyInput {
  readonly sessionId: string;
  readonly timeoutMs?: number;
  readonly commandName?: string;
}
export interface WaitForNextReadyOutput {
  readonly state: SessionState;
  readonly durationMs: number;
}

export interface StopSessionInput {
  readonly sessionId: string;
}
export interface StopSessionOutput {
  readonly stopped: true;
}

export interface ListSessionsInput {
  // no inputs
  readonly _?: never;
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
