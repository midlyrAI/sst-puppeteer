import { z, ZodError } from 'zod';
import {
  CommandAlreadyRunningError,
  CommandNotFoundError,
  CommandNotRunningError,
  StreamConnectionError,
  UpdateFailedError,
} from '../core/index.js';
import {
  DaemonGetCommandStatusParamsSchema,
  DaemonListCommandsParamsSchema,
  DaemonReadCommandLogsParamsSchema,
  DaemonRestartCommandParamsSchema,
  DaemonStartCommandParamsSchema,
  DaemonStopCommandParamsSchema,
  DaemonStopSessionParamsSchema,
  DaemonWaitForNextReadyParamsSchema,
  DaemonWaitForReadyParamsSchema,
} from './wire-schemas.js';

export const IpcMethodSchema = z.enum([
  'wait_for_ready',
  'wait_for_next_ready',
  'list_commands',
  'get_command_status',
  'start_command',
  'stop_command',
  'restart_command',
  'read_command_logs',
  'stop_session',
]);
export type IpcMethod = z.infer<typeof IpcMethodSchema>;

export const IpcRequestSchema = z.object({
  id: z.string(),
  method: IpcMethodSchema,
  params: z.record(z.string(), z.unknown()).default({}),
});
export type IpcRequest = z.infer<typeof IpcRequestSchema>;

export const IpcResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    id: z.string(),
    ok: z.literal(true),
    result: z.unknown(),
  }),
  z.object({
    id: z.string(),
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  }),
]);
export type IpcResponse = z.infer<typeof IpcResponseSchema>;

export const WireErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'COMMAND_NOT_FOUND',
  'COMMAND_ALREADY_RUNNING',
  'COMMAND_NOT_RUNNING',
  'TIMEOUT',
  'DISCONNECTED',
  'SHUTTING_DOWN',
  'INTERNAL',
]);
export type WireErrorCode = z.infer<typeof WireErrorCodeSchema>;

export const daemonParamsSchemaFor = (method: IpcMethod): z.ZodType => {
  switch (method) {
    case 'wait_for_ready':
      return DaemonWaitForReadyParamsSchema;
    case 'wait_for_next_ready':
      return DaemonWaitForNextReadyParamsSchema;
    case 'list_commands':
      return DaemonListCommandsParamsSchema;
    case 'get_command_status':
      return DaemonGetCommandStatusParamsSchema;
    case 'start_command':
      return DaemonStartCommandParamsSchema;
    case 'stop_command':
      return DaemonStopCommandParamsSchema;
    case 'restart_command':
      return DaemonRestartCommandParamsSchema;
    case 'read_command_logs':
      return DaemonReadCommandLogsParamsSchema;
    case 'stop_session':
      return DaemonStopSessionParamsSchema;
  }
};

export const mapErrorToWire = (err: unknown): { code: WireErrorCode; message: string } => {
  if (err instanceof ZodError) {
    return { code: 'VALIDATION_ERROR', message: err.message };
  }
  if (err instanceof CommandNotFoundError) {
    return { code: 'COMMAND_NOT_FOUND', message: err.message };
  }
  if (err instanceof CommandAlreadyRunningError) {
    return { code: 'COMMAND_ALREADY_RUNNING', message: err.message };
  }
  if (err instanceof CommandNotRunningError) {
    return { code: 'COMMAND_NOT_RUNNING', message: err.message };
  }
  if (err instanceof UpdateFailedError) {
    return { code: 'TIMEOUT', message: err.message };
  }
  if (err instanceof StreamConnectionError) {
    return { code: 'DISCONNECTED', message: err.message };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'INTERNAL', message };
};

export const wireToExitCode = (code: WireErrorCode | string): number => {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 2;
    case 'DISCONNECTED':
      return 4;
    case 'SHUTTING_DOWN':
    case 'COMMAND_NOT_FOUND':
    case 'COMMAND_ALREADY_RUNNING':
    case 'COMMAND_NOT_RUNNING':
    case 'TIMEOUT':
    case 'INTERNAL':
    default:
      return 1;
  }
};
