import { type DeployState } from '@sst-puppeteer/core';

export const TOOL_NAMES = [
  'start_session',
  'wait_for_ready',
  'wait_for_redeploy',
  'invoke_function',
  'read_logs',
  'stop_session',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface StartSessionInput {
  readonly projectDir: string;
  readonly awsProfile?: string;
}
export interface StartSessionOutput {
  readonly sessionId: string;
}

export interface WaitForReadyInput {
  readonly sessionId: string;
  readonly timeoutMs?: number;
}
export interface WaitForReadyOutput {
  readonly state: DeployState;
  readonly durationMs: number;
}

export interface WaitForRedeployInput {
  readonly sessionId: string;
  readonly since?: number;
  readonly timeoutMs?: number;
}
export interface WaitForRedeployOutput {
  readonly state: DeployState;
  readonly durationMs: number;
}

export interface InvokeFunctionInput {
  readonly sessionId: string;
  readonly functionName: string;
  readonly payload: unknown;
}
export interface InvokeFunctionOutput {
  readonly statusCode: number;
  readonly response: unknown;
  readonly logs: readonly string[];
}

export interface ReadLogsInput {
  readonly sessionId: string;
  readonly functionName: string;
  readonly since?: number;
  readonly limit?: number;
}
export interface ReadLogsOutput {
  readonly lines: readonly string[];
}

export interface StopSessionInput {
  readonly sessionId: string;
}
export interface StopSessionOutput {
  readonly stopped: true;
}
