// Barrel exports for the shared session module. Both `src/cli/` and
// `src/mcp/` (in later chunks) import from here.

export * as paths from './paths.js';
export * as meta from './meta.js';
export * as locks from './locks.js';
export * as wireSchemas from './wire-schemas.js';

export {
  IpcMethodSchema,
  IpcRequestSchema,
  IpcResponseSchema,
  WireErrorCodeSchema,
  daemonParamsSchemaFor,
  mapErrorToWire,
  wireToExitCode,
  type IpcMethod,
  type IpcRequest,
  type IpcResponse,
  type WireErrorCode,
} from './protocol.js';

export { IpcServer } from './ipc-server.js';
export { IpcClient, IpcCallError } from './ipc-client.js';
export {
  spawnDaemon,
  defaultSpawnFns,
  resolveEntryMode,
  resolveDaemonEntryPath,
  type SpawnDaemonOpts,
  type SpawnDaemonResult,
  type SpawnFns,
  type EntryMode,
} from './spawn.js';

export { SessionBusyError, acquireLock, dedupKey } from './locks.js';
export type { AcquireLockOpts } from './locks.js';

export {
  SessionManager,
  SessionNotFoundError,
  SessionUnhealthyError,
  SessionAmbiguousError,
  SessionStartingError,
  type ResolvedSession,
  type ResolveArgs,
  type SessionManagerOpts,
  type SpawnDaemonFn,
  type IpcClientFactory,
} from './manager.js';

export {
  MetaSchema,
  readMeta,
  tryReadMeta,
  writeMeta,
  readLastNLines,
  probeLiveness,
  validatePidOwnership,
  cleanupStaleSession,
  type SessionMeta,
} from './meta.js';
