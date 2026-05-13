/**
 * leak.test.ts
 *
 * AC-D4: Verifies that a start + stop cycle does not leak Node.js handles or requests.
 * AC-D5: Verifies that stop() resolves quickly even when start() is still pending
 *        (i.e. waiting for 'ready' state that never arrives).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  SessionBuilder,
  PaneLogWatcher,
  type Pty,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
  type SstBusEvent,
} from '../../src/core/index.js';
import { FakeEventStream } from '../helpers/fake-event-stream.js';

// ---------------------------------------------------------------------------
// Noop Pty
// ---------------------------------------------------------------------------

class NoopPty implements Pty {
  readonly pid: number | null = null;

  private _exitHandlers: Set<PtyExitHandler> = new Set();

  async spawn(_opts: PtySpawnOptions): Promise<void> {}

  write(_data: string): void {}

  onData(_handler: PtyDataHandler): PtyUnsubscribe {
    return () => {};
  }

  onExit(handler: PtyExitHandler): PtyUnsubscribe {
    this._exitHandlers.add(handler);
    return () => {
      this._exitHandlers.delete(handler);
    };
  }

  resize(_cols: number, _rows: number): void {}

  kill(_signal?: string): void {
    // Fire exit immediately so stop() doesn't wait 5s
    setImmediate(() => {
      for (const h of this._exitHandlers) h(0, null);
    });
  }
}

// ---------------------------------------------------------------------------
// Temp dir helpers
// ---------------------------------------------------------------------------

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

function makeTempProjectDir(): string {
  const dir = path.join(os.tmpdir(), `sst-leak-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  cleanupDirs.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// AC-D4: Leak test
// ---------------------------------------------------------------------------

describe('SessionBuilder — handle/request leak', () => {
  it('start + stop cycle does not leak handles or requests', async () => {
    const proc = process as unknown as {
      _getActiveHandles?(): unknown[];
      _getActiveRequests?(): unknown[];
    };

    if (
      typeof proc._getActiveHandles !== 'function' ||
      typeof proc._getActiveRequests !== 'function'
    ) {
      console.warn('[leak.test] _getActiveHandles/_getActiveRequests not available; skipping');
      return;
    }

    const projectDir = makeTempProjectDir();
    const adapter = new NoopPty();
    const stream = new FakeEventStream<SstBusEvent>();

    const session = new SessionBuilder({
      adapter,
      projectDir,
      commands: [],
      eventStreamFactory: () => stream,
      paneLogWatcherFactory: () => new PaneLogWatcher({ projectDir, pollIntervalMs: 30 }),
    }).build();

    const handlesBefore = proc._getActiveHandles!().length;
    const requestsBefore = proc._getActiveRequests!().length;

    // Drive to ready
    const startPromise = session.start();
    setTimeout(() => {
      stream.emit({
        type: 'project.StackCommandEvent',
        event: { App: 'a', Stage: 's', Config: 'c', Command: 'deploy', Version: '0' },
      });
      stream.emit({
        type: 'project.CompleteEvent',
        event: { UpdateID: '1', Errors: [], Finished: true, Old: false },
      });
    }, 50);

    await startPromise;
    await session.stop();

    // Allow Node a tick to settle
    await new Promise<void>((r) => setImmediate(r));

    const handlesAfter = proc._getActiveHandles!().length;
    const requestsAfter = proc._getActiveRequests!().length;

    expect(handlesAfter - handlesBefore).toBeLessThanOrEqual(0);
    expect(requestsAfter - requestsBefore).toBeLessThanOrEqual(0);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// AC-D5: Graceful shutdown test
// ---------------------------------------------------------------------------

describe('SessionBuilder — graceful shutdown', () => {
  it('stop() resolves within 10s even when start() is still waiting for ready', async () => {
    const projectDir = makeTempProjectDir();
    const adapter = new NoopPty();
    const stream = new FakeEventStream<SstBusEvent>();

    const session = new SessionBuilder({
      adapter,
      projectDir,
      commands: [],
      eventStreamFactory: () => stream,
      paneLogWatcherFactory: () => new PaneLogWatcher({ projectDir, pollIntervalMs: 30 }),
    }).build();

    // Emit StackCommandEvent to transition to busy — CompleteEvent is never sent
    const startPromise = session.start();
    setTimeout(() => {
      stream.emit({
        type: 'project.StackCommandEvent',
        event: { App: 'a', Stage: 's', Config: 'c', Command: 'deploy', Version: '0' },
      });
    }, 50);

    // After 100ms, call stop() while start() is still pending
    await new Promise<void>((r) => setTimeout(r, 100));

    const t0 = Date.now();
    await session.stop();
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeLessThan(10_000);

    // start() should eventually reject — swallow the error
    await startPromise.catch(() => {});
  }, 15_000);
});
