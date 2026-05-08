import { expectTypeOf } from 'expect-type';
import { test } from 'vitest';
import {
  type ISession,
  type PtyAdapter,
  type SessionEvent,
  type SessionOptions,
  type SSTSession,
} from '../src/index.js';

test('SSTSession satisfies ISession', () => {
  expectTypeOf<SSTSession>().toMatchTypeOf<ISession>();
});

test('PtyAdapter.pid is number | null', () => {
  expectTypeOf<PtyAdapter['pid']>().toEqualTypeOf<number | null>();
});

test('SessionEvent is a discriminated union with the expected variants', () => {
  expectTypeOf<SessionEvent['type']>().toEqualTypeOf<
    'state-change' | 'deploy-progress' | 'command-status-change' | 'log-line' | 'error'
  >();
});

test('SessionOptions has no adapterFactory or sstServerUrl, and has optional stage', () => {
  expectTypeOf<SessionOptions>().not.toHaveProperty('adapterFactory');
  expectTypeOf<SessionOptions>().not.toHaveProperty('sstServerUrl');
  expectTypeOf<SessionOptions['stage']>().toEqualTypeOf<string | undefined>();
});
