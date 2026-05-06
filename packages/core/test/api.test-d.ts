import { expectTypeOf } from 'expect-type';
import { test } from 'vitest';
import {
  type EventHandler,
  type ISession,
  type LogLineEvent,
  type PtyAdapter,
  type SessionEvent,
  type StateChangeEvent,
  type SSTSession,
} from '../src/index.js';

test('SSTSession satisfies ISession', () => {
  expectTypeOf<SSTSession>().toMatchTypeOf<ISession>();
});

test('PtyAdapter.pid is number | null', () => {
  expectTypeOf<PtyAdapter['pid']>().toEqualTypeOf<number | null>();
});

test('SessionEvent is a discriminated union of 5 variants', () => {
  expectTypeOf<SessionEvent['type']>().toEqualTypeOf<
    'state-change' | 'deploy-progress' | 'function-invocation' | 'log-line' | 'error'
  >();
});

test('on<T>() narrows the handler argument by event type', () => {
  expectTypeOf<EventHandler<'log-line'>>().parameter(0).toEqualTypeOf<LogLineEvent>();
  expectTypeOf<EventHandler<'state-change'>>().parameter(0).toEqualTypeOf<StateChangeEvent>();
});
