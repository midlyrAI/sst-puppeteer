import type { StateChangeEvent } from '../state/state-change-event.js';
import type { CommandStatusChangeEvent } from '../command/command-status-change-event.js';
import type { LogLineEvent } from '../command/log-line-event.js';

export type { StateChangeEvent } from '../state/state-change-event.js';
export type { CommandStatusChangeEvent } from '../command/command-status-change-event.js';
export type { LogLineEvent } from '../command/log-line-event.js';

export interface ErrorEvent {
  readonly type: 'error';
  readonly timestamp: number;
  readonly source: 'pty' | 'sse' | 'log' | 'session';
  readonly message: string;
  readonly cause?: unknown;
}

export type SessionEvent = StateChangeEvent | CommandStatusChangeEvent | LogLineEvent | ErrorEvent;

export type SessionEventType = SessionEvent['type'];
