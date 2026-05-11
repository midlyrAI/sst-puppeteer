import { z } from 'zod';

export const SessionState = {
  IDLE: 'idle',
  BUSY: 'busy',
  READY: 'ready',
  ERROR: 'error',
  DISCONNECTED: 'disconnected',
} as const;
export type SessionState = (typeof SessionState)[keyof typeof SessionState];
export const SessionStateSchema = z.enum(SessionState);

export const SESSION_STATES = Object.values(SessionState);
