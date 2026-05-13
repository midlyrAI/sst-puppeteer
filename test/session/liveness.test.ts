import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeMeta } from '../../src/session/meta.js';
import { daemonLogPath, sessionDir, socketPath } from '../../src/session/paths.js';
import { SessionManager, SessionUnhealthyError } from '../../src/session/manager.js';

describe('liveness', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync('/tmp/sstp-');
    vi.stubEnv('SST_PUPPETEER_STATE_ROOT', stateDir);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    try {
      fs.rmSync(stateDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('Tests 12+13: stale session (dead pid) is detected and cleaned + exit info includes log tail', async () => {
    const sid = crypto.randomUUID();
    fs.mkdirSync(sessionDir(sid), { recursive: true });
    fs.writeFileSync(daemonLogPath(sid), 'line1\nline2\nDIED HERE\n', 'utf-8');
    writeMeta(sid, {
      sessionId: sid,
      projectDir: '/tmp/p',
      stage: 'default',
      pid: 999_999,
      pgid: 999_999,
      startTimeMs: Date.now() - 10_000,
      socketPath: socketPath(sid),
      createdAt: Date.now(),
      status: 'running',
    });

    const resolver = new SessionManager();
    let caught: SessionUnhealthyError | null = null;
    try {
      await resolver.resolve({ session: sid });
    } catch (e) {
      caught = e as SessionUnhealthyError;
    }
    expect(caught).toBeInstanceOf(SessionUnhealthyError);
    expect(caught!.details['sessionDirRemoved']).toBe(true);
    expect(String(caught!.details['daemonLogTail'])).toContain('DIED HERE');
    expect(fs.existsSync(sessionDir(sid))).toBe(false);
  });
});
