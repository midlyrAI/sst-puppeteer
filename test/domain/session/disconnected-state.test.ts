/**
 * disconnected-state.test.ts
 *
 * Verifies SSTSession reaches the 'disconnected' deploy state when the
 * underlying EventStream emits a StreamConnectionError, and that all
 * command-mutating methods reject from that state. `stop()` must still
 * tear down cleanly.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  type Pty,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
  type SstBusEvent,
  SSTSession,
  StreamConnectionError,
} from '../../../src/index.js';
import { FakeEventStream } from '../../helpers/fake-event-stream.js';

class MockPty implements Pty {
  readonly pid: number | null = 1234;
  private _exitHandlers = new Set<PtyExitHandler>();

  async spawn(_opts: PtySpawnOptions): Promise<void> {}
  write(_data: string): void {}
  onData(_h: PtyDataHandler): PtyUnsubscribe {
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
    setImmediate(() => {
      for (const h of this._exitHandlers) h(0, null);
    });
  }
}

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const dir of cleanupDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

function tempDir(): string {
  const dir = path.join(os.tmpdir(), `sst-disconnected-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  cleanupDirs.push(dir);
  return dir;
}

describe('SSTSession — disconnected state', () => {
  it('transitions to disconnected on StreamConnectionError and rejects command methods', async () => {
    const projectDir = tempDir();
    const adapter = new MockPty();
    const stream = new FakeEventStream<SstBusEvent>();

    const session = new SSTSession({
      adapter,
      projectDir,
      eventStreamFactory: () => stream,
      commands: [
        {
          name: 'Service-A',
          kind: 'service',
          command: 'echo hello',
          autostart: false,
          killable: true,
        },
      ],
    });

    // Drive to ready in next tick
    setImmediate(() => {
      stream.emit({
        type: 'project.StackCommandEvent',
        event: { App: 'a', Stage: 's', Config: 'c', Command: 'deploy', Version: 'v' },
      });
      stream.emit({
        type: 'project.CompleteEvent',
        event: { UpdateID: 'u', Errors: [], Finished: true, Old: false },
      });
    });

    await session.start();
    expect(session.state).toBe('ready');

    // Capture state-change event
    const stateChanges: Array<{ from: string; to: string }> = [];
    session.on('state-change', (ev) => stateChanges.push({ from: ev.from, to: ev.to }));

    // Force a connection error
    stream.emitError(new StreamConnectionError('boom', 'http://x/stream', 3));

    expect(session.state).toBe('disconnected');
    expect(stateChanges).toContainEqual({ from: 'ready', to: 'disconnected' });

    await expect(session.startCommand('Service-A')).rejects.toBeInstanceOf(StreamConnectionError);
    await expect(session.stopCommand('Service-A')).rejects.toBeInstanceOf(StreamConnectionError);
    await expect(session.restartCommand('Service-A')).rejects.toBeInstanceOf(StreamConnectionError);

    await expect(session.stop()).resolves.toBeUndefined();
  }, 10_000);
});
