import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { z } from 'zod';
import { IpcClient } from '../daemon/ipc-client.js';
import { daemonLogPath, metaPath, sessionDir } from './paths.js';

export const MetaSchema = z.object({
  sessionId: z.string().uuid(),
  projectDir: z.string(),
  stage: z.string().default('default'),
  pid: z.number().nullable(),
  pgid: z.number().nullable(),
  startTimeMs: z.number().nullable(),
  socketPath: z.string(),
  createdAt: z.number(),
  status: z.enum(['starting', 'running', 'stopped']),
  awsProfile: z.string().optional(),
  awsRegion: z.string().optional(),
});

export type SessionMeta = z.infer<typeof MetaSchema>;

export const writeMeta = (sessionId: string, meta: SessionMeta): void => {
  fs.mkdirSync(sessionDir(sessionId), { recursive: true });
  const finalPath = metaPath(sessionId);
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(meta), 'utf-8');
  fs.renameSync(tmpPath, finalPath);
};

export const readMeta = (sessionId: string): SessionMeta => {
  const raw = fs.readFileSync(metaPath(sessionId), 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  return MetaSchema.parse(parsed);
};

export const tryReadMeta = (sessionId: string): SessionMeta | null => {
  try {
    return readMeta(sessionId);
  } catch {
    return null;
  }
};

export const readLastNLines = (filePath: string, n: number): string => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const tail = lines.slice(Math.max(0, lines.length - n));
    return tail.join('\n');
  } catch {
    return '';
  }
};

export const probeLiveness = async (
  meta: SessionMeta,
): Promise<{ pidAlive: boolean; socketAlive: boolean }> => {
  if (meta.pid === null) {
    return { pidAlive: false, socketAlive: false };
  }
  let pidAlive = false;
  try {
    process.kill(meta.pid, 0);
    pidAlive = true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    pidAlive = code === 'EPERM';
  }

  let socketAlive = false;
  try {
    const client = await IpcClient.connect(meta.socketPath, 2000);
    client.close();
    socketAlive = true;
  } catch {
    socketAlive = false;
  }

  return { pidAlive, socketAlive };
};

export const validatePidOwnership = async (meta: SessionMeta): Promise<boolean> => {
  if (meta.pid === null || meta.startTimeMs === null) return false;
  try {
    const out = execFileSync('ps', ['-p', String(meta.pid), '-o', 'lstart='], {
      encoding: 'utf-8',
      timeout: 2000,
    }).trim();
    if (out === '') return false;
    const parsed = Date.parse(out);
    if (Number.isNaN(parsed)) return false;
    return Math.abs(parsed - meta.startTimeMs) <= 2000;
  } catch {
    return false;
  }
};

export const cleanupStaleSession = (
  sessionId: string,
): { logTail: string; sessionDirRemoved: boolean } => {
  const logTail = readLastNLines(daemonLogPath(sessionId), 50);
  let sessionDirRemoved = false;
  try {
    fs.rmSync(sessionDir(sessionId), { recursive: true, force: true });
    sessionDirRemoved = true;
  } catch {
    sessionDirRemoved = false;
  }
  return { logTail, sessionDirRemoved };
};
