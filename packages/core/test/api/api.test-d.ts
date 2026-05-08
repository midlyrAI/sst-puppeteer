import { expectTypeOf, test } from 'vitest';
import { type ISession } from '../../src/api/session.js';
import { type ISessionLifecycle } from '../../src/api/session-lifecycle.js';
import { type ICommandLifecycle } from '../../src/api/command-lifecycle.js';
import { type ICommandStateReader } from '../../src/api/command-state-reader.js';
import { type IObservable } from '../../src/api/observable.js';
import { type SessionEvent } from '../../src/domain/session-event.js';
import { type SSTSession } from '../../src/orchestration/session.js';

test('ISession extends each sub-interface', () => {
  expectTypeOf<ISession>().toMatchTypeOf<ISessionLifecycle>();
  expectTypeOf<ISession>().toMatchTypeOf<ICommandLifecycle>();
  expectTypeOf<ISession>().toMatchTypeOf<ICommandStateReader>();
  expectTypeOf<ISession>().toMatchTypeOf<IObservable<SessionEvent>>();
});

test('SSTSession satisfies ISession', () => {
  expectTypeOf<SSTSession>().toMatchTypeOf<ISession>();
});

test('sub-interfaces are independently consumable', () => {
  const _lifecycle: ISessionLifecycle = null as unknown as ISessionLifecycle;
  const _commands: ICommandLifecycle = null as unknown as ICommandLifecycle;
  const _reader: ICommandStateReader = null as unknown as ICommandStateReader;
  const _bus: IObservable<SessionEvent> = null as unknown as IObservable<SessionEvent>;
  void _lifecycle;
  void _commands;
  void _reader;
  void _bus;
});
