import { expectTypeOf } from 'expect-type';
import { test } from 'vitest';
import { type SessionEvent, type SessionOptions } from '../../../src/index.js';

test('SessionEvent is a discriminated union with the expected variants', () => {
  expectTypeOf<SessionEvent['type']>().toEqualTypeOf<
    'state-change' | 'command-status-change' | 'log-line' | 'error'
  >();
});

test('SessionOptions has no adapterFactory or sstServerUrl, and has optional stage', () => {
  expectTypeOf<SessionOptions>().not.toHaveProperty('adapterFactory');
  expectTypeOf<SessionOptions>().not.toHaveProperty('sstServerUrl');
  expectTypeOf<SessionOptions['stage']>().toEqualTypeOf<string | undefined>();
});
