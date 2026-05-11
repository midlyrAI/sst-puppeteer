import { z } from 'zod';

export const SessionStateSchema = z.enum(['idle', 'busy', 'ready', 'error', 'disconnected']);
export type SessionState = z.infer<typeof SessionStateSchema>;

export const SESSION_STATES = SessionStateSchema.options;
