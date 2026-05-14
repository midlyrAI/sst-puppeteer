import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NotImplementedError,
  SSTSession,
  type Pty,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
} from '../../src/core/index.js';
import { IpcServer } from '../../src/session/ipc-server.js';
import { SessionManager } from '../../src/session/manager.js';
import { sessionDir, socketPath } from '../../src/session/paths.js';
import type { SpawnDaemonOpts, SpawnDaemonResult } from '../../src/session/spawn.js';

class StubPty implements Pty {
  readonly pid: number | null = null;
  async spawn(_o: PtySpawnOptions): Promise<void> {
    throw new NotImplementedError('stub.spawn');
  }
  write(_d: string): void {
    // noop
  }
  onData(_h: PtyDataHandler): PtyUnsubscribe {
    return () => {};
  }
  onExit(_h: PtyExitHandler): PtyUnsubscribe {
    return () => {};
  }
  resize(_c: number, _r: number): void {
    // noop
  }
  kill(): void {
    // noop
  }
}

describe('SessionManager.startOrAttach — idempotent upsert', () => {
  let stateDir: string;
  const servers: IpcServer[] = [];
  const sessions: SSTSession[] = [];

  beforeEach(() => {
    stateDir = fs.mkdtempSync('/tmp/sstp-');
    vi.stubEnv('SST_PUPPETEER_STATE_ROOT', stateDir);
  });

  afterEach(async () => {
    for (const s of servers) {
      try {
        await s.stop();
      } catch {
        // ignore
      }
    }
    servers.length = 0;
    for (const sess of sessions) {
      try {
        await sess.stop();
      } catch {
        // ignore
      }
    }
    sessions.length = 0;
    vi.unstubAllEnvs();
    try {
      fs.rmSync(stateDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const makeSpawn = (): {
    spawn: (opts: SpawnDaemonOpts) => Promise<SpawnDaemonResult>;
    calls: { sessionId: string }[];
  } => {
    const calls: { sessionId: string }[] = [];
    const spawn = async (opts: SpawnDaemonOpts): Promise<SpawnDaemonResult> => {
      calls.push({ sessionId: opts.sessionId });
      // Stand up an in-process IpcServer so the wait_for_ready RPC succeeds.
      fs.mkdirSync(sessionDir(opts.sessionId), { recursive: true });
      const sess = new SSTSession({ adapter: new StubPty(), projectDir: '/tmp/p' });
      vi.spyOn(sess, 'waitForReady').mockResolvedValue({ state: 'ready', durationMs: 1 });
      vi.spyOn(sess, 'stop').mockResolvedValue(undefined);
      const server = new IpcServer(sess, socketPath(opts.sessionId));
      await server.start();
      servers.push(server);
      sessions.push(sess);
      return { pid: process.pid, startTimeMs: Date.now() };
    };
    return { spawn, calls };
  };

  it('10 parallel calls → 1 spawn, identical sessionId, 1 reused:false + 9 reused:true', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sstp-proj-'));
    const { spawn, calls } = makeSpawn();
    const manager = new SessionManager({ spawnDaemon: spawn });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        manager.startOrAttach({ projectDir, stage: 'dev', wait: true }),
      ),
    );

    expect(calls).toHaveLength(1);
    const ids = new Set(results.map((r) => r.sessionId));
    expect(ids.size).toBe(1);
    const reusedFalse = results.filter((r) => r.reused === false);
    const reusedTrue = results.filter((r) => r.reused === true);
    expect(reusedFalse).toHaveLength(1);
    expect(reusedTrue).toHaveLength(9);
    for (const r of results) {
      expect(r.status).toBe('ready');
    }

    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('subsequent serial call reuses the existing session', async () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sstp-proj-'));
    const { spawn, calls } = makeSpawn();
    const manager = new SessionManager({ spawnDaemon: spawn });

    const first = await manager.startOrAttach({ projectDir, stage: 'dev' });
    expect(first.reused).toBe(false);
    expect(first.status).toBe('ready');

    const second = await manager.startOrAttach({ projectDir, stage: 'dev' });
    expect(second.reused).toBe(true);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.status).toBe('ready');
    expect(calls).toHaveLength(1);

    fs.rmSync(projectDir, { recursive: true, force: true });
  });
});
