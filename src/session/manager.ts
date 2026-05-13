import * as path from 'node:path';
import { IpcClient } from './ipc-client.js';
import {
  cleanupStaleSession,
  probeLiveness,
  tryReadMeta,
  validatePidOwnership,
  type SessionMeta,
} from './meta.js';
import { allSessionDirs } from './paths.js';
import type { SpawnDaemonOpts, SpawnDaemonResult } from './spawn.js';

export type SpawnDaemonFn = (opts: SpawnDaemonOpts) => Promise<SpawnDaemonResult>;
export type IpcClientFactory = (socketPath: string) => Promise<IpcClient>;

export interface ResolvedSession {
  readonly sessionId: string;
  readonly meta: SessionMeta;
  readonly client: IpcClient;
  readonly resolved: 'explicit' | 'implicit';
}

export interface ResolveArgs {
  readonly session?: string;
  readonly project?: string;
  readonly stage?: string;
}

export class SessionNotFoundError extends Error {
  override readonly name = 'SessionNotFoundError';
  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class SessionUnhealthyError extends Error {
  override readonly name = 'SessionUnhealthyError';
  constructor(
    message: string,
    readonly reason: 'corrupted' | 'pid-dead' | 'socket-dead' | 'ownership-failed' | 'unknown',
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export class SessionAmbiguousError extends Error {
  override readonly name = 'SessionAmbiguousError';
  constructor(
    message: string,
    readonly candidates: readonly string[],
  ) {
    super(message);
  }
}

export class SessionStartingError extends Error {
  override readonly name = 'SessionStartingError';
  constructor(
    message: string,
    readonly sessionId: string,
  ) {
    super(message);
  }
}

export interface SessionManagerOpts {
  readonly spawnDaemon?: SpawnDaemonFn;
  readonly ipcClientFactory?: IpcClientFactory;
  readonly clock?: () => number;
}

const livenessLookup = async (
  sessionId: string,
): Promise<{
  meta: SessionMeta | null;
  pidAlive: boolean;
  socketAlive: boolean;
}> => {
  const meta = tryReadMeta(sessionId);
  if (meta === null) return { meta: null, pidAlive: false, socketAlive: false };
  if (meta.status === 'starting') return { meta, pidAlive: false, socketAlive: false };
  const liveness = await probeLiveness(meta);
  return { meta, ...liveness };
};

/**
 * High-level session lifecycle manager. Folds the v1 `SessionResolver` class
 * into `resolve()`. For Chunk A, `startOrAttach`, `list`, `stop`, and
 * `connect` are not yet implemented — they land in Chunks B/C.
 */
export class SessionManager {
  constructor(_opts: SessionManagerOpts = {}) {
    // Per A15: holds no long-lived state. Opts are wired through in Chunk B.
  }

  async resolve(args: ResolveArgs): Promise<ResolvedSession> {
    let sessionId: string | undefined;
    let resolvedMode: 'explicit' | 'implicit' = 'explicit';

    if (args.session !== undefined) {
      sessionId = args.session;
    } else if (args.project !== undefined) {
      const projectAbs = path.resolve(args.project);
      const stage = args.stage ?? 'default';
      const matches: string[] = [];
      for (const id of allSessionDirs()) {
        const meta = tryReadMeta(id);
        if (meta === null) continue;
        if (path.resolve(meta.projectDir) === projectAbs && (meta.stage ?? 'default') === stage) {
          matches.push(id);
        }
      }
      if (matches.length === 0) {
        throw new SessionNotFoundError('No session for project+stage', {
          project: projectAbs,
          stage,
        });
      }
      if (matches.length > 1) {
        throw new SessionAmbiguousError(
          'Multiple sessions match project+stage; use --session',
          matches,
        );
      }
      sessionId = matches[0];
    } else {
      const all = allSessionDirs();
      if (all.length === 0) {
        throw new SessionNotFoundError('No session found');
      }
      const live: string[] = [];
      for (const id of all) {
        const r = await livenessLookup(id);
        if (r.meta !== null && r.pidAlive && r.socketAlive) live.push(id);
      }
      if (live.length === 0) {
        throw new SessionNotFoundError('No live session found');
      }
      if (live.length > 1) {
        throw new SessionAmbiguousError(
          'Ambiguous: multiple sessions running. Use --session or --project+--stage.',
          live,
        );
      }
      sessionId = live[0];
      resolvedMode = 'implicit';
    }

    if (sessionId === undefined) {
      throw new SessionNotFoundError('No session found');
    }

    const meta = tryReadMeta(sessionId);
    if (meta === null) {
      const cleanup = cleanupStaleSession(sessionId);
      throw new SessionUnhealthyError('corrupted or missing meta.json', 'corrupted', {
        sessionId,
        sessionDirRemoved: cleanup.sessionDirRemoved,
        daemonLogTail: cleanup.logTail,
      });
    }

    if (meta.status === 'starting' || meta.pid === null) {
      throw new SessionStartingError('session is starting, retry shortly', sessionId);
    }

    const { pidAlive, socketAlive } = await probeLiveness(meta);
    if (pidAlive && socketAlive) {
      const client = await IpcClient.connect(meta.socketPath, 2000);
      return { sessionId, meta, client, resolved: resolvedMode };
    }

    if (pidAlive && !socketAlive) {
      const owned = await validatePidOwnership(meta);
      if (owned) {
        try {
          process.kill(meta.pid, 'SIGKILL');
        } catch {
          // ignore
        }
      }
      const cleanup = cleanupStaleSession(sessionId);
      throw new SessionUnhealthyError('daemon pid alive but socket dead', 'socket-dead', {
        sessionId,
        sessionDirRemoved: cleanup.sessionDirRemoved,
        daemonLogTail: cleanup.logTail,
        ownerVerified: owned,
      });
    }

    const cleanup = cleanupStaleSession(sessionId);
    throw new SessionUnhealthyError('Session daemon is not running', 'pid-dead', {
      sessionId,
      sessionDirRemoved: cleanup.sessionDirRemoved,
      daemonLogTail: cleanup.logTail,
    });
  }

  // ─── stubs (implemented in Chunks B/C) ──────────────────────────────────────

  async startOrAttach(_opts: unknown): Promise<never> {
    throw new Error('SessionManager.startOrAttach is implemented in Chunk B');
  }

  async list(): Promise<never> {
    throw new Error('SessionManager.list is implemented in Chunk B');
  }

  async stop(_sessionId: string): Promise<never> {
    throw new Error('SessionManager.stop is implemented in Chunk B/C');
  }

  async connect(_sessionId: string): Promise<never> {
    throw new Error('SessionManager.connect is implemented in Chunk C');
  }
}
