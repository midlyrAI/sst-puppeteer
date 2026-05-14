import { z } from 'zod';

export const CommandStatus = {
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPED: 'stopped',
  ERRORED: 'errored',
} as const;
export type CommandStatus = (typeof CommandStatus)[keyof typeof CommandStatus];
export const CommandStatusSchema = z.enum(CommandStatus);

export const CommandSpecSchema = z.object({
  name: z.string(),
  command: z.string(),
  directory: z.string().nullish(),
  environment: z.record(z.string(), z.string()).nullish(),
  autostart: z.boolean(),
  link: z.array(z.string()).nullish(),
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
