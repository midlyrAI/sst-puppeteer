import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as http from 'node:http';
import { ServerFileWatcher } from '../../../src/core/infra/discovery/server-file-watcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeServerFile(projectDir: string, stage: string, url: string): void {
  const sstDir = path.join(projectDir, '.sst');
  fs.mkdirSync(sstDir, { recursive: true });
  fs.writeFileSync(path.join(sstDir, `${stage}.server`), url + '\n', 'utf8');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const cleanupDirs: string[] = [];

afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ServerFileWatcher', () => {
  it('Test 1: file-appearing-after-start — getUrl() starts null, then returns URL after file is written', async () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'test',
      pollIntervalMs: 100,
    });

    watcher.start();
    expect(watcher.getUrl()).toBeNull();

    const fired: string[] = [];
    const unsub = watcher.onUrl((url) => fired.push(url));

    // Write file after a short delay
    await wait(150);
    makeServerFile(tmpDir, 'test', 'http://0.0.0.0:12345');

    // Wait for at least one poll cycle to detect it
    await wait(300);

    expect(watcher.getUrl()).toBe('http://0.0.0.0:12345');
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBe('http://0.0.0.0:12345');

    unsub();
    watcher.stop();
  });

  it('Test 2: file pre-existing — getUrl() returns URL after one poll cycle', async () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    // Write file BEFORE start()
    makeServerFile(tmpDir, 'staging', 'http://0.0.0.0:54321');

    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'staging',
      pollIntervalMs: 100,
    });

    watcher.start();

    // Wait one poll cycle (immediate tick on start() should pick it up)
    await wait(50);

    expect(watcher.getUrl()).toBe('http://0.0.0.0:54321');

    watcher.stop();
  });

  it('Test 3: content changes — handler fires again with new URL', async () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    makeServerFile(tmpDir, 'dev', 'http://0.0.0.0:11111');

    const fired: string[] = [];
    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'dev',
      pollIntervalMs: 100,
    });
    watcher.onUrl((url) => fired.push(url));
    watcher.start();

    // Wait for first detection
    await wait(200);
    expect(watcher.getUrl()).toBe('http://0.0.0.0:11111');
    expect(fired).toHaveLength(1);

    // Overwrite with URL B
    makeServerFile(tmpDir, 'dev', 'http://0.0.0.0:22222');
    await wait(300);

    expect(watcher.getUrl()).toBe('http://0.0.0.0:22222');
    expect(fired).toHaveLength(2);
    expect(fired[1]).toBe('http://0.0.0.0:22222');

    watcher.stop();
  });

  it('Test 4: handler does NOT fire when content is unchanged', async () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    makeServerFile(tmpDir, 'prod', 'http://0.0.0.0:33333');

    const fired: string[] = [];
    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'prod',
      pollIntervalMs: 100,
    });
    watcher.onUrl((url) => fired.push(url));
    watcher.start();

    // Wait for multiple poll cycles — content unchanged
    await wait(450);

    expect(fired).toHaveLength(1); // fired exactly once (first detection)
    expect(watcher.getUrl()).toBe('http://0.0.0.0:33333');

    watcher.stop();
  });

  it('Test 5: idempotent start — calling start() twice does not throw', () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'test',
      pollIntervalMs: 100,
    });

    expect(() => {
      watcher.start();
      watcher.start(); // second call is no-op
    }).not.toThrow();

    watcher.stop();
  });

  it('Test 6: idempotent stop — calling stop() twice does not throw', () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'test',
      pollIntervalMs: 100,
    });

    watcher.start();

    expect(() => {
      watcher.stop();
      watcher.stop(); // second call is no-op
    }).not.toThrow();
  });

  it('Test 7: stop() without start() does not throw', () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'test',
      pollIntervalMs: 100,
    });

    expect(() => watcher.stop()).not.toThrow();
  });

  it('Test 8: handler unsubscribe — handler does not fire after unsubscribe', async () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    const fired: string[] = [];
    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'test',
      pollIntervalMs: 100,
    });

    const unsub = watcher.onUrl((url) => fired.push(url));
    watcher.start();

    // Write first URL
    makeServerFile(tmpDir, 'test', 'http://0.0.0.0:44444');
    await wait(300);
    expect(fired).toHaveLength(1);

    // Unsubscribe
    unsub();

    // Change URL — handler should NOT fire
    makeServerFile(tmpDir, 'test', 'http://0.0.0.0:55555');
    await wait(300);

    expect(fired).toHaveLength(1); // still only 1 — unsubscribed

    watcher.stop();
  });

  it('Test 9: stop() resets _url to null — getUrl() returns null after stop', () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    makeServerFile(tmpDir, 'reset', 'http://0.0.0.0:66666');

    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'reset',
      pollIntervalMs: 100,
    });

    watcher.start();
    // Immediately readable via sync tick
    // We can't guarantee immediate sync read since start() calls _tick() then sets interval
    // Just stop and verify reset
    watcher.stop();
    expect(watcher.getUrl()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // probeAlive tests
  // ---------------------------------------------------------------------------

  it('Test 10: probeAlive returns false when _url is null', async () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'test',
      pollIntervalMs: 100,
    });

    const result = await watcher.probeAlive();
    expect(result).toBe(false);

    watcher.stop();
  });

  it('Test 11: probeAlive returns true when server responds (any HTTP status)', async () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    // Spin up a stub HTTP server that always returns 405
    const server = http.createServer((_req, res) => {
      res.writeHead(405);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      throw new Error('unexpected server address');
    }
    const port = address.port;
    const url = `http://127.0.0.1:${port}`;

    try {
      // Write the server file so watcher picks it up
      makeServerFile(tmpDir, 'live', url);

      const watcher = new ServerFileWatcher({
        projectDir: tmpDir,
        stage: 'live',
        pollIntervalMs: 100,
      });
      watcher.start();

      // Wait for detection
      await wait(200);
      expect(watcher.getUrl()).toBe(url);

      const alive = await watcher.probeAlive(3_000);
      expect(alive).toBe(true);

      watcher.stop();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('Test 12: probeAlive returns false when URL does not respond', async () => {
    const tmpDir = makeTempDir();
    cleanupDirs.push(tmpDir);

    // Use a port that has nothing listening — pick a very unlikely port
    const unusedUrl = 'http://127.0.0.1:1'; // port 1 is privileged and closed

    makeServerFile(tmpDir, 'dead', unusedUrl);

    const watcher = new ServerFileWatcher({
      projectDir: tmpDir,
      stage: 'dead',
      pollIntervalMs: 100,
    });
    watcher.start();

    await wait(200);
    expect(watcher.getUrl()).toBe(unusedUrl);

    const alive = await watcher.probeAlive(1_000); // short timeout
    expect(alive).toBe(false);

    watcher.stop();
  });
});
