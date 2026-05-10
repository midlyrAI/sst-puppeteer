export const SESSION_STATES = ['idle', 'busy', 'ready', 'error', 'disconnected'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

/** Alias retained for event-type readability. */
export type SessionStateName = SessionState;
