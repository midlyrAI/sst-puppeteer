import { describe, expect, it } from 'vitest';
import {
  type Pty,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
  CommandNotFoundError,
  SSTSession,
} from '../src/core/index.js';

class MockPty implements Pty {
  readonly pid: number | null = null;
  async spawn(_opts: PtySpawnOptions): Promise<void> {
    // no-op for construction tests
  }
  write(_data: string): void {}
  onData(_handler: PtyDataHandler): PtyUnsubscribe {
    return () => {};
  }
  onExit(_handler: PtyExitHandler): PtyUnsubscribe {
    return () => {};
  }
  resize(_cols: number, _rows: number): void {}
  kill(_signal?: string): void {}
}

describe('SSTSession smoke', () => {
  const buildSession = (): SSTSession =>
    new SSTSession({
      adapter: new MockPty(),
      projectDir: '/tmp/fake-project',
    });

  it('constructs and assigns an id', () => {
    const session = buildSession();
    expect(session.id).toMatch(/^sst-session-/);
    expect(typeof session.id).toBe('string');
  });

  it('state returns idle before start', () => {
    const session = buildSession();
    expect(session.state).toBe('idle');
  });

  it('listCommands returns empty array before start', () => {
    const session = buildSession();
    expect(session.listCommands()).toEqual([]);
  });

  it('on() returns an unsubscribe function', () => {
    const session = buildSession();
    const unsub = session.on('state-change', () => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });

  it('stop() on an unstarted session is a no-op', async () => {
    const session = buildSession();
    await expect(session.stop()).resolves.toBeUndefined();
  });

  it('getCommandStatus throws CommandNotFoundError for unregistered command', () => {
    const session = buildSession();
    expect(() => session.getCommandStatus('Unknown')).toThrow(CommandNotFoundError);
  });

  it('startCommand throws CommandNotFoundError for unregistered command before start', async () => {
    const session = buildSession();
    await expect(session.startCommand('Unknown')).rejects.toThrow(CommandNotFoundError);
  });

  it('stopCommand throws CommandNotFoundError for unregistered command before start', async () => {
    const session = buildSession();
    await expect(session.stopCommand('Unknown')).rejects.toThrow(CommandNotFoundError);
  });

  it('restartCommand throws CommandNotFoundError for unregistered command before start', async () => {
    const session = buildSession();
    await expect(session.restartCommand('Unknown')).rejects.toThrow(CommandNotFoundError);
  });

  it('readCommandLogs throws CommandNotFoundError for unregistered command before start', async () => {
    const session = buildSession();
    await expect(session.readCommandLogs({ commandName: 'Unknown' })).rejects.toThrow(
      CommandNotFoundError,
    );
  });

  it('start() throws when called a second time (double-start guard)', async () => {
    // Use a temp dir with .sst/log/ already present + a fast exit to make start() fail quickly
    const os = await import('node:os');
    const fs = await import('node:fs');
    const projectDir = fs.mkdtempSync(os.tmpdir() + '/sst-smoke-test-');

    try {
      // Use a special adapter that fires exit immediately to make start() fail fast
      const fakeAdapter: typeof MockPty.prototype = {
        pid: null,
        async spawn() {},
        write() {},
        onData() {
          return () => {};
        },
        onExit(handler) {
          // Fire exit after a brief delay so start() wires up its handlers first
          setTimeout(() => handler(1, null), 20);
          return () => {};
        },
        resize() {},
        kill() {},
      };

      const session = new SSTSession({
        adapter: fakeAdapter,
        projectDir,
        commands: [],
      });

      // Start first call — will fail quickly (exit fired after 20ms)
      const firstStart = session.start().catch(() => {
        /* expected: exit before ready */
      });
      // Yield so _started = true is set
      await Promise.resolve();
      // Second call should throw immediately with already-started error
      await expect(session.start()).rejects.toThrow(/already.started/i);
      await firstStart;
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
