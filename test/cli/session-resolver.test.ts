import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeMeta } from '../../src/cli/state/meta.js';
import { sessionDir, socketPath } from '../../src/cli/state/paths.js';
import * as metaMod from '../../src/cli/state/meta.js';
import * as clientMod from '../../src/cli/daemon/ipc-client.js';
import {
  SessionAmbiguousError,
  SessionNotFoundError,
  SessionResolver,
} from '../../src/cli/state/session-resolver.js';

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

describe('session-resolver', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync('/tmp/sstp-');
    vi.stubEnv('SST_PUPPETEER_STATE_ROOT', stateDir);

    // Stub probeLiveness so we don't need real sockets.
    vi.spyOn(metaMod, 'probeLiveness').mockResolvedValue({
      pidAlive: true,
      socketAlive: true,
    });
    // Stub IpcClient.connect — return a no-op client.
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

  it('Test 14: resolves by --session id', async () => {
    const sid = crypto.randomUUID();
    writeLive(sid, '/tmp/p', 'default');
    const r = await new SessionResolver().resolve({ session: sid });
    expect(r.sessionId).toBe(sid);
    expect(r.resolved).toBe('explicit');
  });

  it('Test 15: resolves by --project + --stage natural key', async () => {
    const sid = crypto.randomUUID();
    writeLive(sid, '/tmp/proj-natural', 'dev');
    const r = await new SessionResolver().resolve({
      project: '/tmp/proj-natural',
      stage: 'dev',
    });
    expect(r.sessionId).toBe(sid);
  });

  it('Test 16: unknown sessionId -> SessionNotFound (when no live), or unhealthy if meta missing', async () => {
    await expect(
      new SessionResolver().resolve({ project: '/never/exists', stage: 'x' }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('Test 17: ambiguous (multiple sessions, no flags) raises', async () => {
    writeLive(crypto.randomUUID(), '/tmp/a', 'default');
    writeLive(crypto.randomUUID(), '/tmp/b', 'default');
    await expect(new SessionResolver().resolve({})).rejects.toBeInstanceOf(SessionAmbiguousError);
  });

  it('Test 18: implicit single-session resolve includes resolved:implicit', async () => {
    const sid = crypto.randomUUID();
    writeLive(sid, '/tmp/only', 'default');
    const r = await new SessionResolver().resolve({});
    expect(r.sessionId).toBe(sid);
    expect(r.resolved).toBe('implicit');
  });
});
