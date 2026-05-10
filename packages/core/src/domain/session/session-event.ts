import { type StateChangeEvent } from '../state/state-change-event.js';
import { type CommandStatusChangeEvent } from '../command/command-status-change-event.js';
import { type LogLineEvent } from '../command/log-line-event.js';

export type { StateChangeEvent } from '../state/state-change-event.js';
export type { CommandStatusChangeEvent } from '../command/command-status-change-event.js';
export type { LogLineEvent } from '../command/log-line-event.js';

export interface DeployProgressEvent {
  readonly type: 'deploy-progress';
  readonly timestamp: number;
  readonly resource: string;
  readonly status: 'pending' | 'updating' | 'done' | 'failed';
  readonly message?: string;
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
  | CommandStatusChangeEvent
  | LogLineEvent
  | ErrorEvent;

export type SessionEventType = SessionEvent['type'];
