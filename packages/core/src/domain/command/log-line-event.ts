import { z } from 'zod';

export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
export const LogLevelSchema = z.enum(LogLevel);

export const LogLineEventSchema = z.object({
  type: z.literal('log-line'),
  timestamp: z.number(),
  functionName: z.string(),
  level: LogLevelSchema,
  message: z.string(),
  requestId: z.string().optional(),
});
export type LogLineEvent = z.infer<typeof LogLineEventSchema>;
