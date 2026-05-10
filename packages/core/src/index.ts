export * from './errors.js';
export * from './constants.js';

// Public API contracts (interfaces only — no runtime code).
export type { ISession } from './api/session.js';
export type { ISessionLifecycle, WaitOptions } from './api/session-lifecycle.js';
export type { ICommandLifecycle } from './api/command-lifecycle.js';
export type { ICommandStateReader } from './api/command-state-reader.js';
export type { IObservable, Unsubscribe } from './api/observable.js';
export type { SessionOptions } from './api/session-options.js';
export type {
  PtyAdapter,
  PtySpawnOptions,
  PtyDataHandler,
  PtyExitHandler,
  PtyUnsubscribe,
} from './api/pty-adapter.js';
export { Logger, NoopLogger } from './api/logger.js';

// Transport implementations.
export { ConsoleLogger } from './transport/logger.js';
export { PtySource, type RawPtyEvent } from './transport/pty-source.js';
export {
  ServerFileWatcher,
  type ServerFileWatcherOptions,
} from './transport/server-file-watcher.js';
export { HttpEventStream, type HttpEventStreamOptions } from './transport/http-event-stream.js';
export {
  PaneLogWatcher,
  type PaneLogWatcherOptions,
  type StartedEvent,
  type StoppedEvent,
  type AppendEvent,
} from './transport/pane-log-watcher.js';
export type { EventStream } from './transport/event-stream.js';

// Domain (pure logic).
export {
  SessionStateMachine,
  type SessionStateChangeHandler,
} from './domain/session-state-machine.js';
export { CommandRegistry, type CommandStatusChangeHandler } from './domain/command-registry.js';
export { parseSstConfig } from './domain/sst-config-parser.js';
export { KEY, type KeySequence } from './domain/keystroke-encoder.js';
export {
  PaneNavigator,
  type PaneNavigatorOptions,
  type NavTarget,
} from './domain/pane-navigator.js';
export * from './domain/command.js';
export * from './domain/session-state.js';
export * from './domain/session-event.js';
export {
  isSstBusEvent,
  isKnownStreamType,
  type SstBusEvent,
  type StreamMessage,
  type UnknownStreamMessage,
  type StackCommandEvent,
  type BuildSuccessEvent,
  type BuildFailedEvent,
  type CompleteEvent,
  type CompleteEventPayload,
  type DeployRequestedEvent,
  type DeployFailedEvent,
  type ConcurrentUpdateEvent,
  type CancelledEvent,
  type SkipEvent,
  type FileChangedEvent,
} from './domain/sst-bus-event.js';

// Orchestration.
export { SSTSession } from './orchestration/session.js';
export { SessionBuilder } from './orchestration/session-builder.js';
