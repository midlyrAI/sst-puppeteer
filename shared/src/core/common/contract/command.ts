import { z } from 'zod';

export const CommandKind = {
  SERVICE: 'service',
  TASK: 'task',
  TUNNEL: 'tunnel',
  FUNCTION_HOST: 'function-host',
} as const;
export type CommandKind = (typeof CommandKind)[keyof typeof CommandKind];
export const CommandKindSchema = z.enum(CommandKind);

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
  kind: CommandKindSchema,
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
