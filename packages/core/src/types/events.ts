export type DeployStateName = 'idle' | 'deploying' | 'ready' | 'error';

export interface StateChangeEvent {
  readonly type: 'state-change';
  readonly timestamp: number;
  readonly from: DeployStateName;
  readonly to: DeployStateName;
}

export interface DeployProgressEvent {
  readonly type: 'deploy-progress';
  readonly timestamp: number;
  readonly resource: string;
  readonly status: 'pending' | 'updating' | 'done' | 'failed';
  readonly message?: string;
}

export interface FunctionInvocationEvent {
  readonly type: 'function-invocation';
  readonly timestamp: number;
  readonly functionName: string;
  readonly requestId: string;
  readonly durationMs?: number;
  readonly statusCode?: number;
}

export interface LogLineEvent {
  readonly type: 'log-line';
  readonly timestamp: number;
  readonly functionName: string;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly requestId?: string;
}

export interface ErrorEvent {
  readonly type: 'error';
  readonly timestamp: number;
  readonly source: 'pty' | 'sse' | 'log' | 'session';
  readonly message: string;
  readonly cause?: unknown;
}

export type SessionEvent =
  | StateChangeEvent
  | DeployProgressEvent
  | FunctionInvocationEvent
  | LogLineEvent
  | ErrorEvent;

export type SessionEventType = SessionEvent['type'];
