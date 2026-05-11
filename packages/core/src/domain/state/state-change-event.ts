import { z } from 'zod';
import { SessionStateSchema } from './session-state.js';

export const StateChangeEventSchema = z.object({
  type: z.literal('state-change'),
  timestamp: z.number(),
  from: SessionStateSchema,
  to: SessionStateSchema,
});
export type StateChangeEvent = z.infer<typeof StateChangeEventSchema>;
