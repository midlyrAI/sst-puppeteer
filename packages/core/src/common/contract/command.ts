import { z } from 'zod';

export const CommandKindSchema = z.enum(['service', 'task', 'tunnel', 'function-host']);
export type CommandKind = z.infer<typeof CommandKindSchema>;

export const CommandStatusSchema = z.enum(['idle', 'starting', 'running', 'stopped', 'errored']);
export type CommandStatus = z.infer<typeof CommandStatusSchema>;

export const CommandSpecSchema = z.object({
  name: z.string(),
  kind: CommandKindSchema,
  command: z.string(),
  directory: z.string().optional(),
  environment: z.record(z.string(), z.string()).optional(),
  autostart: z.boolean(),
  link: z.array(z.string()).optional(),
  killable: z.boolean(),
});
export type CommandSpec = z.infer<typeof CommandSpecSchema>;

export const CommandLastExitSchema = z.object({
  code: z.number().nullable(),
  signal: z.number().nullable(),
});
export type CommandLastExit = z.infer<typeof CommandLastExitSchema>;

export const CommandSchema = z.object({
  spec: CommandSpecSchema,
  status: CommandStatusSchema,
  lastExit: CommandLastExitSchema.optional(),
  startedAt: z.number().optional(),
});
export type Command = z.infer<typeof CommandSchema>;
