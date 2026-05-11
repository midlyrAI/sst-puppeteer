import { z } from 'zod';

export const EventTypeSchema = z.enum([
  'state-change',
  'command-status-change',
  'log-line',
  'error',
]);
export type EventType = z.infer<typeof EventTypeSchema>;
export const EVENT_TYPES = EventTypeSchema.options;

export const DEFAULT_TIMEOUTS = {
  waitForReady: 120_000,
  waitForNextReady: 60_000,
  invokeFunction: 30_000,
} as const;

export const DEFAULT_INVOCATION_HISTORY_LIMIT = 100;
export const DEFAULT_DEDUP_TTL_MS = 5_000;

export { SESSION_STATES } from './domain/state/session-state.js';
