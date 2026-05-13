import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IpcClient } from './ipc-client.js';
import { acquireLock, dedupKey, SessionBusyError } from './locks.js';
import {
  cleanupStaleSession,
  probeLiveness,
  tryReadMeta,
  validatePidOwnership,
  writeMeta,
  type SessionMeta,
} from './meta.js';
import { allSessionDirs, sessionDir as sessionDirFn, socketPath as socketPathFn } from './paths.js';
import {
  spawnDaemon as defaultSpawnDaemon,
  type SpawnDaemonOpts,
  type SpawnDaemonResult,
} from './spawn.js';

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

export class SessionStartFailedError extends Error {
  override readonly name = 'SessionStartFailedError';
  constructor(
    message: string,
    readonly sessionId: string,
    readonly failureReason: string,
  ) {
    super(message);
  }
}

export interface StartOrAttachOpts {
  readonly projectDir: string;
  readonly stage?: string;
  readonly awsProfile?: string;
  readonly awsRegion?: string;
  readonly wait?: boolean;
  readonly readyTimeoutMs?: number;
}

export type StartOrAttachResult =
  | { status: 'ready'; sessionId: string; reused: boolean }
  | { status: 'started'; sessionId: string; reused: false }
  | { status: 'failed'; sessionId: string; reused: false; error: string };

export type SessionState = 'starting' | 'ready' | 'unhealthy' | 'stopped' | 'failed';

export interface SessionRecord extends SessionMeta {
  readonly state: SessionState;
  readonly liveness: { pidAlive: boolean; socketAlive: boolean };
  readonly startedAt: number;
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
 * Walk up from projectDir collecting every existing `node_modules/.bin`
 * directory until the filesystem root. Mirrors npm/pnpm shell-script behavior
 * so locally-installed binaries like `sst` resolve inside the daemon's PTY.
 */
export const collectNodeModulesBins = (projectDir: string): string[] => {
  const bins: string[] = [];
  let dir = path.resolve(projectDir);
  while (true) {
    const candidate = path.join(dir, 'node_modules', '.bin');
    try {
      if (fs.statSync(candidate).isDirectory()) bins.push(candidate);
    } catch {
      // not present at this level
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return bins;
};

const augmentPath = (projectDir: string, basePath: string | undefined): string => {
  const bins = collectNodeModulesBins(projectDir);
  const parts = [...bins];
  if (basePath !== undefined && basePath.length > 0) parts.push(basePath);
  return parts.join(path.delimiter);
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const synthesizeState = (
  meta: SessionMeta,
  liveness: { pidAlive: boolean; socketAlive: boolean },
): SessionState => {
  if (meta.status === 'starting') return 'starting';
  if (meta.status === 'stopped') return 'stopped';
  if (meta.status === 'failed') return 'failed';
  // status === 'running'
  if (liveness.pidAlive && liveness.socketAlive) return 'ready';
  return 'unhealthy';
};

/**
 * High-level session lifecycle manager. Per spec A15: holds no long-lived
 * state. Every method does fs I/O fresh; `connect` returns a fresh
 * `IpcClient` the caller must close.
 */
export class SessionManager {
  private readonly _spawnDaemon: SpawnDaemonFn;
  private readonly _clock: () => number;

  constructor(opts: SessionManagerOpts = {}) {
    this._spawnDaemon = opts.spawnDaemon ?? defaultSpawnDaemon;
    this._clock = opts.clock ?? (() => Date.now());
  }

  async startOrAttach(opts: StartOrAttachOpts): Promise<StartOrAttachResult> {
    const projectDir = path.resolve(opts.projectDir);
    const stage = opts.stage ?? 'default';
    const wait = opts.wait ?? true;
    const readyTimeoutMs = opts.readyTimeoutMs ?? 300_000;
    const awsProfile = opts.awsProfile;
    const awsRegion = opts.awsRegion;

    const key = dedupKey(projectDir, stage);

    // Predicate for stale-lock reclaim: is there a live session for this key?
    const isLiveForKey = async (): Promise<boolean> => {
      for (const id of allSessionDirs()) {
        const meta = tryReadMeta(id);
        if (meta === null) continue;
        if (path.resolve(meta.projectDir) !== projectDir) continue;
        if ((meta.stage ?? 'default') !== stage) continue;
        if (meta.status === 'running') {
          const liveness = await probeLiveness(meta);
          if (liveness.pidAlive && liveness.socketAlive) return true;
        }
      }
      return false;
    };

    const { release } = await acquireLock(key, { isLiveForKey });

    let sessionId: string | null = null;
    let releasedInline = false;
    try {
      // Inside the lock: scan for a live match. If found, reuse it.
      for (const id of allSessionDirs()) {
        const meta = tryReadMeta(id);
        if (meta === null) continue;
        if (path.resolve(meta.projectDir) !== projectDir) continue;
        if ((meta.stage ?? 'default') !== stage) continue;

        if (meta.status === 'running') {
          const liveness = await probeLiveness(meta);
          if (liveness.pidAlive && liveness.socketAlive) {
            release();
            releasedInline = true;
            return { status: 'ready', sessionId: id, reused: true };
          }
          // running but dead — clean up and continue scanning/spawning.
          cleanupStaleSession(id);
          continue;
        }

        if (meta.status === 'starting') {
          // Could be a sibling waiter currently spawning, OR an orphaned
          // starting meta. If socket is alive treat as reusable (after
          // optional wait_for_ready). Otherwise, clean up.
          const liveness = await probeLiveness(meta);
          if (liveness.socketAlive) {
            release();
            releasedInline = true;
            if (wait) {
              const client = await IpcClient.connect(meta.socketPath, 5000);
              try {
                await client.call('wait_for_ready', { timeoutMs: readyTimeoutMs });
              } finally {
                client.close();
              }
            }
            return { status: 'ready', sessionId: id, reused: true };
          }
          cleanupStaleSession(id);
          continue;
        }

        if (meta.status === 'stopped' || meta.status === 'failed') {
          cleanupStaleSession(id);
          continue;
        }
      }

      // No live match — mint a new session.
      sessionId = crypto.randomUUID();
      const sDir = sessionDirFn(sessionId);
      const sockPath = socketPathFn(sessionId);

      fs.mkdirSync(sDir, { recursive: true });
      const createdAt = this._clock();
      const firstMeta: SessionMeta = {
        sessionId,
        projectDir,
        stage,
        pid: null,
        pgid: null,
        startTimeMs: null,
        socketPath: sockPath,
        createdAt,
        status: 'starting',
        ...(awsProfile !== undefined ? { awsProfile } : {}),
        ...(awsRegion !== undefined ? { awsRegion } : {}),
      };
      writeMeta(sessionId, firstMeta);

      // Spawn the daemon. Failure here is propagated as an error after meta
      // is marked failed.
      const env: NodeJS.ProcessEnv = {};
      env['PATH'] = augmentPath(projectDir, process.env['PATH']);
      if (awsProfile !== undefined) env['AWS_PROFILE'] = awsProfile;
      if (awsRegion !== undefined) env['AWS_REGION'] = awsRegion;

      let pid: number;
      let startTimeMs: number;
      try {
        const result = await this._spawnDaemon({
          sessionId,
          sessionDir: sDir,
          env,
        });
        pid = result.pid;
        startTimeMs = result.startTimeMs;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        try {
          writeMeta(sessionId, {
            ...firstMeta,
            status: 'failed',
            failureReason: msg,
            lastUpdatedAt: this._clock(),
          });
        } catch {
          // ignore meta write failure
        }
        const e = new SessionStartFailedError(
          `daemon spawn failed: ${msg}`,
          sessionId,
          msg,
        );
        throw e;
      }

      let pgid: number | null = null;
      try {
        const fn = (process as { getpgid?: (p: number) => number }).getpgid;
        pgid = typeof fn === 'function' ? fn(pid) : pid;
      } catch {
        pgid = pid;
      }

      writeMeta(sessionId, {
        ...firstMeta,
        pid,
        pgid,
        startTimeMs,
        status: 'running',
        lastUpdatedAt: this._clock(),
      });

      // Release the lock as soon as meta is finalized. The wait_for_ready
      // call can take many minutes; we don't want to hold the lock that long.
      release();
      releasedInline = true;

      if (wait) {
        const client = await IpcClient.connect(sockPath, 5000);
        try {
          await client.call('wait_for_ready', { timeoutMs: readyTimeoutMs });
        } finally {
          client.close();
        }
        return { status: 'ready', sessionId, reused: false };
      }
      return { status: 'started', sessionId, reused: false };
    } finally {
      if (!releasedInline) {
        try {
          release();
        } catch {
          // ignore
        }
      }
    }
  }

  async list(): Promise<SessionRecord[]> {
    const records: SessionRecord[] = [];
    for (const id of allSessionDirs()) {
      const meta = tryReadMeta(id);
      if (meta === null) continue;
      let liveness = { pidAlive: false, socketAlive: false };
      if (meta.status === 'running') {
        liveness = await probeLiveness(meta);
      }
      const state = synthesizeState(meta, liveness);
      const startedAt = meta.startTimeMs ?? meta.createdAt;
      records.push({ ...meta, state, liveness, startedAt });
    }
    return records;
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

  async stop(sessionId: string): Promise<{ stopped: true }> {
    const meta = tryReadMeta(sessionId);
    if (meta === null) {
      // Already gone.
      cleanupStaleSession(sessionId);
      return { stopped: true };
    }

    let client: IpcClient | null = null;
    try {
      client = await IpcClient.connect(meta.socketPath, 2000);
    } catch {
      // Connect failed — fall back to liveness probe.
      const { pidAlive, socketAlive } = await probeLiveness(meta);
      if (pidAlive && !socketAlive) {
        cleanupStaleSession(sessionId);
        throw new SessionUnhealthyError(
          'daemon pid alive but socket dead during stop',
          'socket-dead',
          { sessionId },
        );
      }
      cleanupStaleSession(sessionId);
      return { stopped: true };
    }

    try {
      try {
        await client.call('stop_session', {});
      } catch {
        // Daemon may close socket abruptly after responding; ignore.
      }
    } finally {
      client.close();
    }

    // Best-effort: wait briefly for pid to exit before cleanup.
    if (meta.pid !== null) {
      const start = this._clock();
      while (this._clock() - start < 5000) {
        try {
          process.kill(meta.pid, 0);
        } catch {
          break;
        }
        await sleep(50);
      }
    }

    cleanupStaleSession(sessionId);
    return { stopped: true };
  }

  async connect(sessionId: string): Promise<IpcClient> {
    const meta = tryReadMeta(sessionId);
    if (meta === null) {
      throw new SessionNotFoundError('No session with that id', { sessionId });
    }
    if (meta.status === 'starting' || meta.pid === null) {
      throw new SessionStartingError('session is starting, retry shortly', sessionId);
    }
    if (meta.status === 'failed') {
      throw new SessionStartFailedError(
        `session start failed: ${meta.failureReason ?? 'unknown'}`,
        sessionId,
        meta.failureReason ?? 'unknown',
      );
    }
    return IpcClient.connect(meta.socketPath, 2000);
  }
}

// Re-export for callers that previously imported SessionBusyError from this module.
export { SessionBusyError };
