import {
  fork as nodeFork,
  spawn as nodeSpawn,
  type ChildProcess,
  type ForkOptions,
  type SpawnOptions,
} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { readLastNLines } from '../state/meta.js';
import { daemonLogPath, socketPath as socketPathFn } from '../state/paths.js';

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

export const resolveDaemonEntryPath = (): string => {
  // Resolve relative to this module's file. In dev (.ts) returns the source
  // bin file path; in prod (.js) returns the compiled bin file path.
  const here = url.fileURLToPath(import.meta.url);
  // src/cli/daemon/spawn.ts  →  bin/cli.ts
  // dist/src/cli/daemon/spawn.js → dist/bin/cli.js
  if (here.endsWith('.ts')) {
    // dev: src/cli/daemon/spawn.ts → ../../../bin/cli.ts
    return path.resolve(path.dirname(here), '..', '..', '..', 'bin', 'cli.ts');
  }
  // prod: dist/src/cli/daemon/spawn.js → ../../../bin/cli.js
  return path.resolve(path.dirname(here), '..', '..', '..', 'bin', 'cli.js');
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
