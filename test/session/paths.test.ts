import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allSessionDirs,
  daemonLogPath,
  lockDir,
  locksRoot,
  metaPath,
  panesDir,
  sessionDir,
  sessionsRoot,
  socketPath,
  stateRoot,
} from '../../src/session/paths.js';

describe('session/paths', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sst-puppeteer-test-'));
    vi.stubEnv('SST_PUPPETEER_STATE_ROOT', tmp);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('stateRoot honors SST_PUPPETEER_STATE_ROOT', () => {
    expect(stateRoot()).toBe(tmp);
  });

  it('stateRoot falls back to homedir/.sst-puppeteer when env unset', () => {
    vi.unstubAllEnvs();
    expect(stateRoot()).toBe(path.join(os.homedir(), '.sst-puppeteer'));
  });

  it('sessionsRoot, sessionDir, metaPath, socketPath, daemonLogPath, panesDir compose under stateRoot', () => {
    const id = 'abc123';
    expect(sessionsRoot()).toBe(path.join(tmp, 'sessions'));
    expect(sessionDir(id)).toBe(path.join(tmp, 'sessions', id));
    expect(metaPath(id)).toBe(path.join(tmp, 'sessions', id, 'meta.json'));
    expect(socketPath(id)).toBe(path.join(tmp, 'sessions', id, 'daemon.sock'));
    expect(daemonLogPath(id)).toBe(path.join(tmp, 'sessions', id, 'daemon.log'));
    expect(panesDir(id)).toBe(path.join(tmp, 'sessions', id, 'panes'));
  });

  it('locksRoot and lockDir compose under stateRoot', () => {
    expect(locksRoot()).toBe(path.join(tmp, 'locks'));
    expect(lockDir('key')).toBe(path.join(tmp, 'locks', 'key'));
  });

  it('allSessionDirs returns [] when sessionsRoot does not exist', () => {
    expect(allSessionDirs()).toEqual([]);
  });

  it('allSessionDirs lists session directory names', () => {
    fs.mkdirSync(path.join(tmp, 'sessions', 's1'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'sessions', 's2'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'sessions', 'not-a-dir.txt'), 'x');
    const dirs = allSessionDirs().sort();
    expect(dirs).toEqual(['s1', 's2']);
  });
});
