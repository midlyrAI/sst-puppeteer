import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StartCommand } from '../../src/cli/commands/start-command.js';
import { readMeta } from '../../src/session/meta.js';
import type { SpawnDaemonOpts, SpawnDaemonResult } from '../../src/session/spawn.js';

// Sentinel so we can spot any code path that uses Date.now() without
// preserving the first write's createdAt.
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const collectStdout = (chunks: string[]) =>
  ({
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
  }) as unknown as NodeJS.WriteStream;

describe('session/meta — createdAt preservation across two writeMeta calls', () => {
  let stateDir: string;
  let projectDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sstp-state-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sstp-proj-'));
    vi.stubEnv('SST_PUPPETEER_STATE_ROOT', stateDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("preserves createdAt from the first writeMeta after spawnDaemon's second write", async () => {
    // Inject a fake spawnDaemon. Inside it, capture the meta written by the
    // first writeMeta call (status:'starting') so we know what createdAt was
    // sealed in. We also sleep to guarantee a measurable gap so any code that
    // re-stamps createdAt with Date.now() would produce a different value.
    let firstWriteCreatedAt: number | null = null;
    const fakeSpawn = async (opts: SpawnDaemonOpts): Promise<SpawnDaemonResult> => {
      // After StartCommand wrote firstMeta, capture it.
      const meta = JSON.parse(
        fs.readFileSync(path.join(opts.sessionDir, 'meta.json'), 'utf-8'),
      ) as { createdAt: number };
      firstWriteCreatedAt = meta.createdAt;
      // Force a wall-clock gap before the second writeMeta runs.
      await sleep(20);
      return { pid: process.pid, startTimeMs: Date.now() };
    };

    const cmd = new StartCommand(fakeSpawn);
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const ctx = {
      stdout: collectStdout(stdoutChunks),
      stderr: collectStdout(stderrChunks),
      cwd: process.cwd(),
    };
    // Use --no-wait so we don't try to connect to a real socket.
    const code = await cmd.execute([projectDir, '--no-wait'], ctx);
    expect(code).toBe(0);
    expect(firstWriteCreatedAt).not.toBeNull();

    // Parse stdout to get sessionId.
    const out = JSON.parse(stdoutChunks.join('').trim()) as { sessionId: string };
    expect(typeof out.sessionId).toBe('string');

    const finalMeta = readMeta(out.sessionId);
    expect(finalMeta.createdAt).toBe(firstWriteCreatedAt);
    expect(finalMeta.status).toBe('running');
    // lastUpdatedAt should be set on the second write and be >= createdAt.
    expect(finalMeta.lastUpdatedAt).toBeDefined();
    expect(finalMeta.lastUpdatedAt!).toBeGreaterThanOrEqual(finalMeta.createdAt);
  });
});

