import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeMeta } from '../../src/session/meta.js';
import { sessionDir, socketPath } from '../../src/session/paths.js';
import * as metaMod from '../../src/session/meta.js';
import * as clientMod from '../../src/session/ipc-client.js';
import {
  SessionAmbiguousError,
  SessionManager,
  SessionNotFoundError,
} from '../../src/session/manager.js';

const writeLive = (sid: string, projectDir: string, stage: string): void => {
  fs.mkdirSync(sessionDir(sid), { recursive: true });
  writeMeta(sid, {
    sessionId: sid,
    projectDir,
    stage,
    pid: process.pid,
    pgid: process.pid,
    startTimeMs: Date.now(),
    socketPath: socketPath(sid),
    createdAt: Date.now(),
    status: 'running',
  });
};

describe('session/manager.resolve', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync('/tmp/sstp-');
    vi.stubEnv('SST_PUPPETEER_STATE_ROOT', stateDir);

    vi.spyOn(metaMod, 'probeLiveness').mockResolvedValue({
      pidAlive: true,
      socketAlive: true,
    });
    const fakeClient = { close: () => undefined, call: async () => ({}) };
    vi.spyOn(clientMod.IpcClient, 'connect').mockResolvedValue(
      fakeClient as unknown as clientMod.IpcClient,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    try {
      fs.rmSync(stateDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('resolves by --session id', async () => {
    const sid = crypto.randomUUID();
    writeLive(sid, '/tmp/p', 'default');
    const r = await new SessionManager().resolve({ session: sid });
    expect(r.sessionId).toBe(sid);
    expect(r.resolved).toBe('explicit');
  });

  it('resolves by --project + --stage natural key', async () => {
    const sid = crypto.randomUUID();
    writeLive(sid, '/tmp/proj-natural', 'dev');
    const r = await new SessionManager().resolve({
      project: '/tmp/proj-natural',
      stage: 'dev',
    });
    expect(r.sessionId).toBe(sid);
  });

  it('unknown project -> SessionNotFound', async () => {
    await expect(
      new SessionManager().resolve({ project: '/never/exists', stage: 'x' }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('ambiguous (multiple sessions, no flags) raises', async () => {
    writeLive(crypto.randomUUID(), '/tmp/a', 'default');
    writeLive(crypto.randomUUID(), '/tmp/b', 'default');
    await expect(new SessionManager().resolve({})).rejects.toBeInstanceOf(SessionAmbiguousError);
  });

  it('implicit single-session resolve includes resolved:implicit', async () => {
    const sid = crypto.randomUUID();
    writeLive(sid, '/tmp/only', 'default');
    const r = await new SessionManager().resolve({});
    expect(r.sessionId).toBe(sid);
    expect(r.resolved).toBe('implicit');
  });
});
