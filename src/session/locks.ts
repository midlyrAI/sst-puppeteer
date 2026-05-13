import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { lockDir, locksRoot } from './paths.js';

export const dedupKey = (projectDir: string, stage: string): string =>
  crypto.createHash('sha256').update(`${projectDir}:${stage}`).digest('hex').slice(0, 12);

export class SessionBusyError extends Error {
  override readonly name = 'SessionBusyError';
  readonly code = 'EBUSY' as const;
  constructor(
    message: string,
    readonly dedupKey: string,
    readonly lockAgeMs: number,
  ) {
    super(message);
  }
}

export interface AcquireLockOpts {
  readonly staleAfterMs?: number;
  readonly pollMs?: number;
  readonly maxAttempts?: number;
  readonly isLiveForKey?: () => Promise<boolean>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Acquire an exclusive lock under `~/.sst-puppeteer/locks/<key>/` using the
 * mkdir-EEXIST primitive. Returns a release function that rmdirs the lockDir.
 *
 * On EEXIST, polls up to `maxAttempts * pollMs` (default 30 * 200ms = 6s).
 * If the existing lockDir is older than `staleAfterMs` (default 60s) AND
 * `isLiveForKey()` (if provided) returns false, the lockDir is reclaimed.
 *
 * On exhaustion, throws `SessionBusyError { code: 'EBUSY' }`.
 */
export const acquireLock = async (
  key: string,
  opts: AcquireLockOpts = {},
): Promise<{ release: () => void }> => {
  const staleAfterMs = opts.staleAfterMs ?? 60_000;
  const pollMs = opts.pollMs ?? 200;
  const maxAttempts = opts.maxAttempts ?? 30;
  const lockPath = lockDir(key);

  fs.mkdirSync(locksRoot(), { recursive: true });

  const release = (): void => {
    try {
      fs.rmdirSync(lockPath);
    } catch {
      // ignore — already released or removed externally
    }
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      fs.mkdirSync(lockPath, { recursive: false });
      return { release };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;
      // Inspect stale-lock age.
      let lockAgeMs = 0;
      try {
        const stat = fs.statSync(lockPath);
        lockAgeMs = Date.now() - stat.mtimeMs;
      } catch {
        // lockDir disappeared between mkdir and stat — retry immediately.
        continue;
      }
      if (lockAgeMs > staleAfterMs) {
        const live = opts.isLiveForKey === undefined ? false : await opts.isLiveForKey();
        if (!live) {
          try {
            fs.rmdirSync(lockPath);
          } catch {
            // someone else reclaimed it; retry.
          }
          continue;
        }
      }
      await sleep(pollMs);
    }
  }

  // Exhausted attempts.
  let lockAgeMs = 0;
  try {
    lockAgeMs = Date.now() - fs.statSync(lockPath).mtimeMs;
  } catch {
    // ignore
  }
  throw new SessionBusyError(
    `lock contention on ${key} after ${String(maxAttempts * pollMs)}ms`,
    key,
    lockAgeMs,
  );
};
