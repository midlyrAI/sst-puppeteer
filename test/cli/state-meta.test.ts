import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { metaPath, sessionDir } from '../../src/cli/state/paths.js';
import {
  MetaSchema,
  readMeta,
  tryReadMeta,
  writeMeta,
  type SessionMeta,
} from '../../src/cli/state/meta.js';

describe('cli/state/meta', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sst-puppeteer-test-'));
    vi.stubEnv('SST_PUPPETEER_STATE_ROOT', tmp);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const makeMeta = (): SessionMeta => ({
    sessionId: randomUUID(),
    projectDir: '/proj',
    stage: 'default',
    pid: 1234,
    pgid: 1234,
    startTimeMs: 99,
    socketPath: '/tmp/x.sock',
    createdAt: 1700000000000,
    status: 'running',
  });

  it('writes atomically and reads back equal data', () => {
    const meta = makeMeta();
    writeMeta(meta.sessionId, meta);
    expect(readMeta(meta.sessionId)).toEqual(meta);
  });

  it('writeMeta does not leave a .tmp file', () => {
    const meta = makeMeta();
    writeMeta(meta.sessionId, meta);
    const entries = fs.readdirSync(sessionDir(meta.sessionId));
    expect(entries).toContain('meta.json');
    expect(entries.some((e) => e.endsWith('.tmp'))).toBe(false);
  });

  it('readMeta throws on corrupted JSON', () => {
    const id = randomUUID();
    fs.mkdirSync(sessionDir(id), { recursive: true });
    fs.writeFileSync(metaPath(id), 'not json{');
    expect(() => readMeta(id)).toThrow();
  });

  it('tryReadMeta returns null on missing meta', () => {
    expect(tryReadMeta(randomUUID())).toBeNull();
  });

  it('tryReadMeta returns null on corrupted meta', () => {
    const id = randomUUID();
    fs.mkdirSync(sessionDir(id), { recursive: true });
    fs.writeFileSync(metaPath(id), 'not json{');
    expect(tryReadMeta(id)).toBeNull();
  });

  it('MetaSchema rejects invalid status', () => {
    const meta = { ...makeMeta(), status: 'bogus' };
    expect(MetaSchema.safeParse(meta).success).toBe(false);
  });

  it("MetaSchema stage defaults to 'default'", () => {
    const { stage: _stage, ...rest } = makeMeta();
    const result = MetaSchema.parse(rest);
    expect(result.stage).toBe('default');
  });
});
