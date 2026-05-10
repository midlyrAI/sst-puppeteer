import { type SessionEvent } from '../domain/session-event.js';
import { type ICommandLifecycle } from './command-lifecycle.js';
import { type ICommandStateReader } from './command-state-reader.js';
import { type IObservable } from './observable.js';
import { type ISessionLifecycle } from './session-lifecycle.js';

/**
 * Composite session contract — the full surface that {@link SSTSession}
 * implements. Composed of four cohesive sub-interfaces:
 *
 * - {@link ISessionLifecycle} — start/stop/wait gates.
 * - {@link ICommandLifecycle} — per-command start/stop/restart.
 * - {@link ICommandStateReader} — read-only command + log inspection.
 * - {@link IObservable}<{@link SessionEvent}> — event subscription.
 *
 * Most consumers will type against this composite. Code that wants a
 * narrower contract (e.g. a read-only inspector) can depend on a single
 * sub-interface instead.
 */
export interface ISession
  extends ISessionLifecycle, ICommandLifecycle, ICommandStateReader, IObservable<SessionEvent> {}
