import * as fs from 'node:fs';
import { z } from 'zod';
import { metaPath, sessionDir } from './paths.js';

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
