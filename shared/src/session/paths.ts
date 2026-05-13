import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const stateRoot = (): string =>
  process.env.SST_PUPPETEER_STATE_ROOT ?? path.join(os.homedir(), '.sst-puppeteer');

export const sessionsRoot = (): string => path.join(stateRoot(), 'sessions');

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidSessionId = (id: string): boolean => SESSION_ID_RE.test(id);

export const sessionDir = (id: string): string => {
  if (!SESSION_ID_RE.test(id)) {
    throw new Error(`invalid sessionId: ${JSON.stringify(id)}`);
  }
  return path.join(sessionsRoot(), id);
};

export const metaPath = (id: string): string => path.join(sessionDir(id), 'meta.json');

export const socketPath = (id: string): string => path.join(sessionDir(id), 'daemon.sock');

export const daemonLogPath = (id: string): string => path.join(sessionDir(id), 'daemon.log');

export const panesDir = (id: string): string => path.join(sessionDir(id), 'panes');

export const locksRoot = (): string => path.join(stateRoot(), 'locks');

export const lockDir = (dedupKey: string): string => path.join(locksRoot(), dedupKey);

export const allSessionDirs = (): string[] => {
  const root = sessionsRoot();
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && SESSION_ID_RE.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
};
