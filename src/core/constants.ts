import { z } from 'zod';

export const EventType = {
  STATE_CHANGE: 'state-change',
  COMMAND_STATUS_CHANGE: 'command-status-change',
  LOG_LINE: 'log-line',
  ERROR: 'error',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];
export const EventTypeSchema = z.enum(EventType);
export const EVENT_TYPES = Object.values(EventType);

export const DEFAULT_TIMEOUTS = {
  waitForReady: 120_000,
  waitForNextReady: 60_000,
  invokeFunction: 30_000,
} as const;

export const DEFAULT_INVOCATION_HISTORY_LIMIT = 100;
export const DEFAULT_DEDUP_TTL_MS = 5_000;

export { SESSION_STATES } from './domain/state/session-state.js';
