import { type PtyAdapter } from './pty.js';
import { type SessionEvent } from './events.js';
import { type DeployState, type FunctionInfo, type InvocationRecord } from './state.js';
import { type Logger } from '../logger.js';

export type { Logger };

export interface SessionOptions {
  readonly adapter: PtyAdapter;
  readonly projectDir: string;
  readonly logger?: Logger;
  readonly awsProfile?: string;
  readonly awsRegion?: string;
}

export interface InvocationResult {
  readonly statusCode: number;
  readonly response: unknown;
  readonly logs: readonly string[];
  readonly durationMs: number;
}

export interface ReadLogsOptions {
  readonly functionName: string;
  readonly since?: number;
  readonly limit?: number;
}

export interface WaitOptions {
  readonly timeoutMs?: number;
}

export type EventHandler<T extends SessionEvent['type']> = (
  event: Extract<SessionEvent, { type: T }>,
) => void;

export type Unsubscribe = () => void;

export interface ISession {
  readonly id: string;
  readonly state: DeployState;
  start(): Promise<void>;
  stop(): Promise<void>;
  waitForReady(opts?: WaitOptions): Promise<{ state: DeployState; durationMs: number }>;
  waitForRedeploy(
    opts?: WaitOptions & { since?: number },
  ): Promise<{ state: DeployState; durationMs: number }>;
  invokeFunction(functionName: string, payload: unknown): Promise<InvocationResult>;
  readLogs(opts: ReadLogsOptions): Promise<readonly string[]>;
  listFunctions(): readonly FunctionInfo[];
  recentInvocations(functionName: string, limit?: number): readonly InvocationRecord[];
  on<T extends SessionEvent['type']>(type: T, handler: EventHandler<T>): Unsubscribe;
}
