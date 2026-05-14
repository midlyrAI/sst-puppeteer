/**
 * session-lifecycle.test.ts
 *
 * Integration-style tests for SSTSession using MockPty + FakeEventStream.
 * Drives session-state transitions by emitting `/stream` bus events through
 * the injected event stream.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
  CommandNotFoundError,
  CommandAlreadyRunningError,
  CommandNotRunningError,
  type CommandRegistry,
  SSTSession,
  type Pty,
  type SstBusEvent,
} from '../../src/core/index.js';
import { FakeEventStream } from '../helpers/fake-event-stream.js';

// ---------------------------------------------------------------------------
// MockPty — controllable test double
// ---------------------------------------------------------------------------

class MockPty implements Pty {
  readonly pid: number | null = 1234;

  spawnCalls: PtySpawnOptions[] = [];
  writeCalls: string[] = [];
  killCalls: string[] = [];

  private _dataHandlers: Set<PtyDataHandler> = new Set();
  private _exitHandlers: Set<PtyExitHandler> = new Set();

  async spawn(opts: PtySpawnOptions): Promise<void> {
    this.spawnCalls.push(opts);
  }

  write(data: string): void {
    this.writeCalls.push(data);
  }

  onData(handler: PtyDataHandler): PtyUnsubscribe {
    this._dataHandlers.add(handler);
    return () => {
      this._dataHandlers.delete(handler);
    };
  }

  onExit(handler: PtyExitHandler): PtyUnsubscribe {
    this._exitHandlers.add(handler);
    return () => {
      this._exitHandlers.delete(handler);
    };
  }

  resize(_cols: number, _rows: number): void {}

  kill(signal?: string): void {
    this.killCalls.push(signal ?? 'SIGTERM');
    // Automatically fire exit so stop() doesn't wait 5s for the mock
    setImmediate(() => this._emitExit(0, null));
  }

  _emitData(s: string): void {
    for (const h of this._dataHandlers) {
      h(s);
    }
  }

  _emitExit(code: number | null, signal: number | null): void {
    for (const h of this._exitHandlers) {
      h(code, signal);
    }
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
  const dir = path.join(os.tmpdir(), `sst-session-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  cleanupDirs.push(dir);
  return dir;
}

import type { SessionOptions } from '../../src/core/domain/session/session-options.js';

interface FakeRig {
  stream: FakeEventStream<SstBusEvent>;
}

/** Build a session with an injected FakeEventStream. */
function buildSession(
  adapter: MockPty,
  projectDir: string,
  overrides: Partial<SessionOptions> = {},
): { session: SSTSession; rig: FakeRig } {
  const stream = new FakeEventStream<SstBusEvent>();
  const session = new SSTSession({
    adapter,
    projectDir,
    eventStreamFactory: () => stream,
    ...overrides,
  });
  return { session, rig: { stream } };
}

/** Push the deploy → complete pair onto a FakeEventStream in the next tick. */
function driveToReady(stream: FakeEventStream<SstBusEvent>): void {
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
}

// ---------------------------------------------------------------------------
// Test group 1: pre-start guard (no start() needed)
// ---------------------------------------------------------------------------

describe('SSTSession — pre-start guard', () => {
  it('Test 1: getCommandStatus throws CommandNotFoundError for unknown command', () => {
    const session = new SSTSession({
      adapter: new MockPty(),
      projectDir: '/tmp/fake',
      commands: [],
    });

    expect(() => session.getCommandStatus('Unknown')).toThrow(CommandNotFoundError);
  });

  it('Test 2: startCommand throws CommandNotFoundError for unknown command', async () => {
    const session = new SSTSession({
      adapter: new MockPty(),
      projectDir: '/tmp/fake',
      commands: [],
    });

    await expect(session.startCommand('Unknown')).rejects.toThrow(CommandNotFoundError);
  });

  it('Test 3: stopCommand throws CommandNotFoundError for unknown command', async () => {
    const session = new SSTSession({
      adapter: new MockPty(),
      projectDir: '/tmp/fake',
      commands: [],
    });

    await expect(session.stopCommand('Unknown')).rejects.toThrow(CommandNotFoundError);
  });

  it('Test 4: restartCommand throws CommandNotFoundError for unknown command', async () => {
    const session = new SSTSession({
      adapter: new MockPty(),
      projectDir: '/tmp/fake',
      commands: [],
    });

    await expect(session.restartCommand('Unknown')).rejects.toThrow(CommandNotFoundError);
  });

  it('Test 5: readCommandLogs throws CommandNotFoundError for unknown command', async () => {
    const session = new SSTSession({
      adapter: new MockPty(),
      projectDir: '/tmp/fake',
      commands: [],
    });

    await expect(session.readCommandLogs({ commandName: 'Unknown' })).rejects.toThrow(
      CommandNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// Test group 2: start() early-exit detection
// ---------------------------------------------------------------------------

describe('SSTSession — start() early-exit detection', () => {
  it('Test 6: start() rejects with diagnostic message when SST exits before ready', async () => {
    const projectDir = makeTempProjectDir();

    const adapter = new MockPty();
    const { session } = buildSession(adapter, projectDir, { commands: [] });

    const startPromise = session.start();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    adapter._emitExit(1, null);

    await expect(startPromise).rejects.toThrow('sst dev exited during startup');
  });
});

// ---------------------------------------------------------------------------
// Test group 3: state machine transitions
// ---------------------------------------------------------------------------

describe('SSTSession — state machine via /stream events', () => {
  it('Test 7: transitions idle→busy→ready from /stream events and emits state-change events', async () => {
    const projectDir = makeTempProjectDir();
    const adapter = new MockPty();

    const { session, rig } = buildSession(adapter, projectDir, {
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

    const stateChanges: Array<{ from: string; to: string }> = [];
    session.on('state-change', (ev) => {
      stateChanges.push({ from: ev.from, to: ev.to });
    });

    driveToReady(rig.stream);

    await session.start();

    expect(session.state).toBe('ready');
    expect(stateChanges).toContainEqual({ from: 'idle', to: 'busy' });
    expect(stateChanges).toContainEqual({ from: 'busy', to: 'ready' });

    await session.stop();
  }, 10_000);
});

// ---------------------------------------------------------------------------
// Test group 4: startCommand keystroke sequencing
// ---------------------------------------------------------------------------

describe('SSTSession — startCommand keystroke sequencing', () => {
  it('Test 8: startCommand navigates to pane and sends Enter; resolves running after registry confirms', async () => {
    const projectDir = makeTempProjectDir();
    const adapter = new MockPty();

    const { session, rig } = buildSession(adapter, projectDir, {
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

    driveToReady(rig.stream);
    await session.start();
    expect(session.getCommandStatus('Service-A')).toBe('idle');
    adapter.writeCalls.length = 0;

    const registry = (session as unknown as { _commandRegistry: CommandRegistry })._commandRegistry;

    registry.onChange((name, _from, to) => {
      if (name === 'Service-A' && to === 'starting') {
        setImmediate(() => {
          registry.applyStatus('Service-A', 'running');
        });
      }
    });

    await expect(session.startCommand('Service-A')).resolves.toMatchObject({
      status: 'running',
    });

    const writeData = adapter.writeCalls.join('');
    expect(writeData).toContain('j');
    expect(writeData).toContain('\r');

    await session.stop();
  }, 10_000);

  it('Test 9: startCommand throws CommandAlreadyRunningError when pane is running', async () => {
    const projectDir = makeTempProjectDir();
    const adapter = new MockPty();

    const { session, rig } = buildSession(adapter, projectDir, {
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

    driveToReady(rig.stream);
    await session.start();

    const registry = (session as unknown as { _commandRegistry: CommandRegistry })._commandRegistry;
    registry.applyStatus('Service-A', 'running');

    await expect(session.startCommand('Service-A')).rejects.toThrow(CommandAlreadyRunningError);

    await session.stop();
  }, 10_000);

  it('Test 10: stopCommand throws CommandNotRunningError when pane is idle', async () => {
    const projectDir = makeTempProjectDir();
    const adapter = new MockPty();

    const { session, rig } = buildSession(adapter, projectDir, {
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

    driveToReady(rig.stream);
    await session.start();

    await expect(session.stopCommand('Service-A')).rejects.toThrow(CommandNotRunningError);

    await session.stop();
  }, 10_000);
});

// ---------------------------------------------------------------------------
// Test group 5: readCommandLogs
// ---------------------------------------------------------------------------

describe('SSTSession — readCommandLogs', () => {
  it('Test 11: readCommandLogs returns empty array when per-command log file does not exist', async () => {
    const projectDir = makeTempProjectDir();
    const adapter = new MockPty();

    const { session, rig } = buildSession(adapter, projectDir, {
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

    driveToReady(rig.stream);
    await session.start();

    const logs = await session.readCommandLogs({ commandName: 'Service-A' });
    expect(logs).toEqual([]);

    await session.stop();
  }, 10_000);

  it('Test 12: readCommandLogs reads lines from per-command log file and applies limit', async () => {
    const projectDir = makeTempProjectDir();
    const adapter = new MockPty();

    const logDir = path.join(projectDir, '.sst', 'log');
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'Service-A.log'), 'line 1\nline 2\nline 3\n', 'utf8');

    const { session, rig } = buildSession(adapter, projectDir, {
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

    driveToReady(rig.stream);
    await session.start();

    const logs = await session.readCommandLogs({ commandName: 'Service-A' });
    expect(logs).toEqual(['line 1', 'line 2', 'line 3']);

    const limited = await session.readCommandLogs({ commandName: 'Service-A', limit: 2 });
    expect(limited).toEqual(['line 2', 'line 3']);

    await session.stop();
  }, 10_000);

  it('Test 13: readCommandLogs throws CommandNotFoundError for unknown command', async () => {
    const projectDir = makeTempProjectDir();
    const adapter = new MockPty();

    const { session, rig } = buildSession(adapter, projectDir, { commands: [] });

    driveToReady(rig.stream);
    await session.start();

    await expect(session.readCommandLogs({ commandName: 'Nonexistent' })).rejects.toThrow(
      CommandNotFoundError,
    );

    await session.stop();
  }, 10_000);
});

// ---------------------------------------------------------------------------
// Test group 6: commands override
// ---------------------------------------------------------------------------

describe('SSTSession — commands override', () => {
  it('Test 14: SessionOptions.commands bypasses sst.config.ts and registers specs directly', async () => {
    const projectDir = makeTempProjectDir();
    const adapter = new MockPty();

    const { session, rig } = buildSession(adapter, projectDir, {
      commands: [
        {
          name: 'Worker-A',
          kind: 'service',
          command: 'node worker',
          autostart: false,
          killable: true,
        },
        {
          name: 'Worker-B',
          kind: 'task',
          command: 'node task',
          autostart: false,
          killable: true,
        },
      ],
    });

    driveToReady(rig.stream);
    await session.start();

    const commands = session.listCommands();
    expect(commands).toHaveLength(2);
    expect(commands.map((c) => c.spec.name)).toContain('Worker-A');
    expect(commands.map((c) => c.spec.name)).toContain('Worker-B');

    await session.stop();
  }, 10_000);
});
