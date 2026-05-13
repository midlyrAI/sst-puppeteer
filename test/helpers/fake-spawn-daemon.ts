import { spawn as nodeSpawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import type { SpawnDaemonOpts, SpawnDaemonResult } from '../../src/session/spawn.js';

const here = url.fileURLToPath(import.meta.url);
const fakeDaemonScript = path.resolve(path.dirname(here), 'fake-daemon-script.ts');

/**
 * Test-only `SpawnDaemonFn` that boots `fake-daemon-script.ts` via tsx as a
 * detached child. The fake daemon opens the real UDS at the meta's socket
 * path so cross-surface tests can exercise the entire on-disk + IPC flow
 * without launching `sst dev`.
 *
 * Survives parent exit (detached + unref). The child exits cleanly on
 * SIGTERM/SIGINT or after answering `stop_session`.
 */
export const fakeSpawnDaemon = async (opts: SpawnDaemonOpts): Promise<SpawnDaemonResult> => {
  fs.mkdirSync(opts.sessionDir, { recursive: true });
  const logPath = path.join(opts.sessionDir, 'daemon.log');
  const logFd = fs.openSync(logPath, 'a');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(opts.env ?? {}),
    SST_PUPPETEER_SESSION_DIR: opts.sessionDir,
  };

  const child = nodeSpawn(process.execPath, ['--import', 'tsx', fakeDaemonScript, opts.sessionId], {
    detached: true,
    stdio: ['ignore', logFd, logFd, 'ipc'],
    env,
  });

  fs.closeSync(logFd);

  const timeoutMs = opts.readyTimeoutMs ?? 10_000;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('message', onMessage);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      if (err) reject(err);
      else resolve();
    };
    const onMessage = (msg: unknown): void => {
      if (typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'ready') {
        finish();
      }
    };
    const onError = (err: Error): void => finish(err);
    const onExit = (code: number | null): void =>
      finish(new Error(`fake daemon exited early (code=${String(code)})`));
    const timer = setTimeout(
      () => finish(new Error(`fake daemon not ready in ${timeoutMs}ms`)),
      timeoutMs,
    );

    child.on('error', onError);
    child.on('exit', onExit);
    child.on('message', onMessage);
  });

  const pid = child.pid;
  if (pid === undefined) throw new Error('fake daemon has no pid');
  try {
    child.disconnect();
  } catch {
    /* ignore */
  }
  child.unref();

  return { pid, startTimeMs: Date.now() };
};
