import {
  fork as nodeFork,
  spawn as nodeSpawn,
  type ChildProcess,
  type ForkOptions,
  type SpawnOptions,
} from 'node:child_process';
import * as fs from 'node:fs';
import { readLastNLines } from './meta.js';
import { daemonLogPath, socketPath as socketPathFn } from './paths.js';

export interface SpawnFns {
  fork: (entry: string, args: readonly string[], opts: ForkOptions) => ChildProcess;
  spawn: (cmd: string, args: readonly string[], opts: SpawnOptions) => ChildProcess;
}

export const defaultSpawnFns: SpawnFns = {
  fork: (entry, args, opts) => nodeFork(entry, args as string[], opts),
  spawn: (cmd, args, opts) => nodeSpawn(cmd, args as string[], opts),
};

export type EntryMode = 'fork' | 'spawn-tsx';

export const resolveEntryMode = (entryPath?: string): EntryMode => {
  const p = entryPath ?? resolveDaemonEntryPath();
  return p.endsWith('.ts') || p.endsWith('.tsx') ? 'spawn-tsx' : 'fork';
};

/**
 * The daemon entry path is whichever bin stamped `SST_PUPPETEER_DAEMON_ENTRY`
 * on startup. Both `cli/bin/sst-puppeteer.ts` and `mcp/bin/sst-puppeteer-mcp.ts`
 * set it to their own `fileURLToPath(import.meta.url)` so the daemon shares
 * the caller's binary — no path-resolution heuristics, works under both
 * tsx (dev .ts) and node (built .js).
 *
 * Tests can either set the env var, pass `daemonEntryPath` via `SpawnDaemonOpts`,
 * or inject a fake `spawnDaemon` to bypass this entirely.
 */
export const resolveDaemonEntryPath = (): string => {
  const fromEnv = process.env['SST_PUPPETEER_DAEMON_ENTRY'];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  throw new Error(
    'SST_PUPPETEER_DAEMON_ENTRY not set — daemon entry resolver was called without a bin having stamped it. Tests should either set the env var, pass daemonEntryPath via SpawnDaemonOpts, or inject a fake spawnDaemon.',
  );
};

export interface SpawnDaemonOpts {
  readonly sessionId: string;
  readonly sessionDir: string;
  readonly daemonEntryPath?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly spawnFns?: SpawnFns;
  readonly readyTimeoutMs?: number;
}

export interface SpawnDaemonResult {
  readonly pid: number;
  readonly startTimeMs: number;
}

export const spawnDaemon = async (opts: SpawnDaemonOpts): Promise<SpawnDaemonResult> => {
  const fns = opts.spawnFns ?? defaultSpawnFns;
  const entry = opts.daemonEntryPath ?? resolveDaemonEntryPath();
  const mode = resolveEntryMode(entry);
  const timeoutMs = opts.readyTimeoutMs ?? 30_000;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(opts.env ?? {}),
    SST_PUPPETEER_SESSION_DIR: opts.sessionDir,
  };

  fs.mkdirSync(opts.sessionDir, { recursive: true });
  const logFd = fs.openSync(daemonLogPath(opts.sessionId), 'a');

  let child: ChildProcess;
  try {
    if (mode === 'fork') {
      child = fns.fork(entry, ['__daemon', opts.sessionId], {
        detached: true,
        stdio: ['ignore', logFd, logFd, 'ipc'],
        env,
      });
    } else {
      child = fns.spawn(process.execPath, ['--import', 'tsx', entry, '__daemon', opts.sessionId], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env,
      });
    }
  } finally {
    fs.closeSync(logFd);
  }

  const sockPath = socketPathFn(opts.sessionId);

  const ready = await new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean, err?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      if (err) reject(err);
      else resolve(ok);
    };
    const cleanup = (): void => {
      child.removeListener('message', onMessage);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      if (pollTimer !== null) clearInterval(pollTimer);
    };
    const onMessage = (msg: unknown): void => {
      if (typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'ready') {
        finish(true);
      }
    };
    const onError = (err: Error): void => finish(false, err);
    const onExit = (code: number | null): void => {
      const tail = readLastNLines(daemonLogPath(opts.sessionId), 50);
      finish(
        false,
        new Error(`daemon exited (code=${String(code)}) before ready. Log tail:\n${tail}`),
      );
    };

    let pollTimer: NodeJS.Timeout | null = null;

    child.on('error', onError);
    child.on('exit', onExit);
    if (mode === 'fork') {
      child.on('message', onMessage);
    } else {
      pollTimer = setInterval(() => {
        try {
          fs.statSync(sockPath);
          finish(true);
        } catch {
          // not yet
        }
      }, 50);
    }

    const timer = setTimeout(() => {
      const tail = readLastNLines(daemonLogPath(opts.sessionId), 50);
      finish(
        false,
        new Error(`daemon failed to become ready within ${timeoutMs}ms. Log tail:\n${tail}`),
      );
    }, timeoutMs);
  }).catch((err: Error) => {
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore
    }
    throw err;
  });

  if (!ready) {
    throw new Error('daemon not ready');
  }

  const pid = child.pid;
  if (pid === undefined) {
    throw new Error('daemon child has no pid');
  }
  const startTimeMs = Date.now();

  if (mode === 'fork') {
    try {
      child.disconnect();
    } catch {
      // ignore
    }
  }
  child.unref();

  return { pid, startTimeMs };
};
