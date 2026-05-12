import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const stateRoot = (): string =>
  process.env.SST_PUPPETEER_STATE_ROOT ?? path.join(os.homedir(), '.sst-puppeteer');

export const sessionsRoot = (): string => path.join(stateRoot(), 'sessions');

export const sessionDir = (id: string): string => path.join(sessionsRoot(), id);

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
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
};
