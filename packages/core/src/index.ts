export * from './common/error/errors.js';
export * from './constants.js';

// Public API contracts — deleted interfaces removed, kept types preserved.
export type { WaitOptions, Unsubscribe, SessionOptions } from './domain/session/session-options.js';
export type {
  Pty,
  PtySpawnOptions,
  PtyDataHandler,
  PtyExitHandler,
  PtyUnsubscribe,
} from './infra/pty/node-pty-adapter.js';
export { Logger, NoopLogger } from './common/logger/logger.js';

// Transport implementations.
export { ConsoleLogger } from './common/logger/logger.js';
export { NodePtyAdapter } from './infra/pty/node-pty-adapter.js';
export {
  ServerFileWatcher,
  type ServerFileWatcherOptions,
} from './infra/discovery/server-file-watcher.js';
export { HttpEventStream, type HttpEventStreamOptions } from './infra/stream/http-event-stream.js';
export {
  PaneLogWatcher,
  type PaneLogWatcherOptions,
  type StartedEvent,
  type StoppedEvent,
  type AppendEvent,
} from './infra/pane-log/pane-log-watcher.js';

// Domain (pure logic).
export {
  SessionStateMachine,
  type SessionStateChangeHandler,
} from './domain/state/session-state-machine.js';
export {
  CommandRegistry,
  type CommandStatusChangeHandler,
} from './domain/command/command-registry.js';
export { parseSstConfig } from './infra/config/sst-config-parser.js';
export { KEY, type KeySequence } from './common/keystroke/keystroke-encoder.js';
export {
  PaneNavigator,
  type PaneNavigatorOptions,
  type NavTarget,
} from './domain/pane/pane-navigator.js';
export * from './common/contract/command.js';
export * from './domain/state/session-state.js';
export * from './domain/session/session-event.js';
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
} from './infra/stream/sst-bus-event.js';

// Orchestration.
export { SSTSession } from './domain/session/sst-session.js';
export { SessionBuilder } from './domain/session/session-builder.js';
