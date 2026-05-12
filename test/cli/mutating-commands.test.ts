import * as fs from 'node:fs';
import * as path from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommandStatus,
  NotImplementedError,
  SSTSession,
  type Pty,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
} from '../../src/core/index.js';
import { IpcServer } from '../../src/cli/daemon/ipc-server.js';
import { RestartCommandCommand } from '../../src/cli/commands/restart-command-command.js';
import { StartSstCommandCommand } from '../../src/cli/commands/start-sst-command-command.js';
import { StopSstCommandCommand } from '../../src/cli/commands/stop-sst-command-command.js';
import { writeMeta } from '../../src/cli/state/meta.js';

class StubPty implements Pty {
  readonly pid: number | null = null;
  async spawn(_o: PtySpawnOptions): Promise<void> {
    throw new NotImplementedError('stub.spawn');
  }
  write(_d: string): void {
    throw new NotImplementedError('stub.write');
  }
  onData(_h: PtyDataHandler): PtyUnsubscribe {
    return () => {};
  }
  onExit(_h: PtyExitHandler): PtyUnsubscribe {
    return () => {};
  }
  resize(_c: number, _r: number): void {
    // noop
  }
  kill(): void {
    // noop
  }
}

const buildStubSession = (): SSTSession =>
  new SSTSession({ adapter: new StubPty(), projectDir: '/tmp/p' });

const makeWritable = (): { stream: Writable; data: () => string } => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, data: () => chunks.join('') };
};

const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff';

describe('mutating-commands', () => {
  let tmpDir: string;
  let sockPath: string;
  let server: IpcServer | null = null;
  let session: SSTSession;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync('/tmp/mc-');
    sockPath = path.join(tmpDir, 'd.sock');
    const sessionSubDir = path.join(tmpDir, 'sessions', SESSION_ID);
    fs.mkdirSync(sessionSubDir, { recursive: true });

    vi.stubEnv('SST_PUPPETEER_STATE_ROOT', tmpDir);

    session = buildStubSession();
  });

  afterEach(async () => {
    if (server !== null) {
      await server.stop();
      server = null;
    }
    vi.unstubAllEnvs();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const startServer = async (): Promise<void> => {
    server = new IpcServer(session, sockPath);
    await server.start();

    writeMeta(SESSION_ID, {
      sessionId: SESSION_ID,
      projectDir: '/tmp/p',
      stage: 'default',
      pid: process.pid,
      pgid: process.pid,
      startTimeMs: Date.now(),
      socketPath: sockPath,
      createdAt: Date.now(),
      status: 'running',
    });
  };

  const makeCtx = (stdout: Writable, stderr: Writable) => ({ stdout, stderr, cwd: tmpDir });

  it('start-command > starts named pane and returns status+durationMs', async () => {
    vi.spyOn(session, 'startCommand').mockResolvedValue({
      status: CommandStatus.RUNNING,
      durationMs: 42,
    } as never);

    await startServer();

    const cmd = new StartSstCommandCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(
      ['--session', SESSION_ID, '--command-name', 'app'],
      makeCtx(out.stream, err.stream),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out.data().trim());
    expect(parsed.status).toBe(CommandStatus.RUNNING);
    expect(parsed.durationMs).toBe(42);
  });

  it('stop-command > stops named pane and returns status:stopped', async () => {
    vi.spyOn(session, 'stopCommand').mockResolvedValue({
      status: CommandStatus.STOPPED,
    } as never);

    await startServer();

    const cmd = new StopSstCommandCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(
      ['--session', SESSION_ID, '--command-name', 'app'],
      makeCtx(out.stream, err.stream),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out.data().trim());
    expect(parsed.status).toBe(CommandStatus.STOPPED);
  });

  it('restart-command > restarts named pane', async () => {
    vi.spyOn(session, 'restartCommand').mockResolvedValue({
      status: CommandStatus.RUNNING,
      durationMs: 99,
    } as never);

    await startServer();

    const cmd = new RestartCommandCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(
      ['--session', SESSION_ID, '--command-name', 'app'],
      makeCtx(out.stream, err.stream),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out.data().trim());
    expect(parsed.status).toBe(CommandStatus.RUNNING);
    expect(parsed.durationMs).toBe(99);
  });

  it('start-command > returns exit 2 when --command-name missing', async () => {
    await startServer();

    const cmd = new StartSstCommandCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(['--session', SESSION_ID], makeCtx(out.stream, err.stream));

    expect(code).toBe(2);
    const parsed = JSON.parse(err.data().trim());
    expect(parsed.error).toMatch(/--command-name/);
  });
});
