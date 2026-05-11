import { z } from 'zod';
import { StateChangeEventSchema } from '../state/state-change-event.js';
import { CommandStatusChangeEventSchema } from '../command/command-status-change-event.js';
import { LogLineEventSchema } from '../command/log-line-event.js';

export { StateChangeEventSchema, type StateChangeEvent } from '../state/state-change-event.js';
export {
  CommandStatusChangeEventSchema,
  type CommandStatusChangeEvent,
} from '../command/command-status-change-event.js';
export { LogLineEventSchema, type LogLineEvent } from '../command/log-line-event.js';

export const ErrorSource = {
  PTY: 'pty',
  SSE: 'sse',
  LOG: 'log',
  SESSION: 'session',
} as const;
export type ErrorSource = (typeof ErrorSource)[keyof typeof ErrorSource];
export const ErrorSourceSchema = z.enum(ErrorSource);

export const ErrorEventSchema = z.object({
  type: z.literal('error'),
  timestamp: z.number(),
  source: ErrorSourceSchema,
  message: z.string(),
  cause: z.unknown().optional(),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export const SessionEventSchema = z.discriminatedUnion('type', [
  StateChangeEventSchema,
  CommandStatusChangeEventSchema,
  LogLineEventSchema,
  ErrorEventSchema,
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export type SessionEventType = SessionEvent['type'];
