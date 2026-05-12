import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  CommandAlreadyRunningError,
  CommandNotFoundError,
  CommandNotRunningError,
  StreamConnectionError,
  UpdateFailedError,
} from '../../src/core/index.js';
import {
  IpcRequestSchema,
  IpcResponseSchema,
  daemonParamsSchemaFor,
  mapErrorToWire,
  wireToExitCode,
} from '../../src/cli/daemon/protocol.js';

describe('daemon-protocol', () => {
  it('Test 1: request envelope roundtrips through zod parse', () => {
    const req = { id: 'abc', method: 'wait_for_ready', params: { timeoutMs: 1000 } };
    const parsed = IpcRequestSchema.parse(req);
    expect(parsed.id).toBe('abc');
    expect(parsed.method).toBe('wait_for_ready');
    expect(parsed.params).toEqual({ timeoutMs: 1000 });

    const okResp = { id: 'abc', ok: true, result: { state: 'ready' } };
    const errResp = { id: 'abc', ok: false, error: { code: 'INTERNAL', message: 'boom' } };
    expect(IpcResponseSchema.parse(okResp).ok).toBe(true);
    expect(IpcResponseSchema.parse(errResp).ok).toBe(false);
  });

  it('Test 2: error response maps exception class to wire code', () => {
    expect(mapErrorToWire(new CommandNotFoundError('x')).code).toBe('COMMAND_NOT_FOUND');
    expect(mapErrorToWire(new CommandAlreadyRunningError('x')).code).toBe('COMMAND_ALREADY_RUNNING');
    expect(mapErrorToWire(new CommandNotRunningError('x')).code).toBe('COMMAND_NOT_RUNNING');
    expect(mapErrorToWire(new UpdateFailedError('x')).code).toBe('TIMEOUT');
    expect(mapErrorToWire(new StreamConnectionError('x', '', 0)).code).toBe('DISCONNECTED');
    expect(mapErrorToWire(new Error('generic')).code).toBe('INTERNAL');

    expect(wireToExitCode('VALIDATION_ERROR')).toBe(2);
    expect(wireToExitCode('DISCONNECTED')).toBe(4);
    expect(wireToExitCode('INTERNAL')).toBe(1);
  });

  it('Test 3: ZodError maps to VALIDATION_ERROR wire code', () => {
    let zodErr: ZodError | null = null;
    try {
      daemonParamsSchemaFor('get_command_status').parse({});
    } catch (e) {
      zodErr = e as ZodError;
    }
    expect(zodErr).toBeInstanceOf(ZodError);
    const wire = mapErrorToWire(zodErr);
    expect(wire.code).toBe('VALIDATION_ERROR');
  });
});
