import { z } from 'zod';
import { CommandLastExitSchema, CommandStatusSchema } from '../../common/contract/command.js';

export const CommandStatusChangeEventSchema = z.object({
  type: z.literal('command-status-change'),
  timestamp: z.number(),
  commandName: z.string(),
  from: CommandStatusSchema,
  to: CommandStatusSchema,
  lastExit: CommandLastExitSchema.optional(),
});
export type CommandStatusChangeEvent = z.infer<typeof CommandStatusChangeEventSchema>;
