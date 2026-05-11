import { z } from 'zod';

export const LogLineEventSchema = z.object({
  type: z.literal('log-line'),
  timestamp: z.number(),
  functionName: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  requestId: z.string().optional(),
});
export type LogLineEvent = z.infer<typeof LogLineEventSchema>;
