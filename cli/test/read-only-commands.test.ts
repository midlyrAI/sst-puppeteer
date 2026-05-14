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
} from '../../shared/src/core/index.js';
import { IpcServer } from '../../shared/src/session/ipc-server.js';
import { GetCommandStatusCommand } from '../src/commands/get-command-status-command.js';
import { ListCommandsCommand } from '../src/commands/list-commands-command.js';
import { ReadCommandLogsCommand } from '../src/commands/read-command-logs-command.js';
import { WaitForNextReadyCommand } from '../src/commands/wait-for-next-ready-command.js';
import { WaitForReadyCommand } from '../src/commands/wait-for-ready-command.js';
import { writeMeta } from '../../shared/src/session/meta.js';

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

// Use a real UUID v4 (required by MetaSchema) and /tmp for shorter paths.
// macOS UDS path limit is 104 chars; /tmp avoids the long /var/folders/ prefix.
const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('read-only-commands', () => {
  let tmpDir: string;
  let sockPath: string;
  let server: IpcServer | null = null;
  let session: SSTSession;

  beforeEach(() => {
    // Use /tmp directly to avoid macOS UDS 104-char path limit.
    tmpDir = fs.mkdtempSync('/tmp/rc-');
    // Socket lives flat in tmpDir to stay well under 104 chars.
    sockPath = path.join(tmpDir, 'd.sock');
    // Create sessions/<id> dir so writeMeta (via paths.ts) can write meta.json.
    const sessionSubDir = path.join(tmpDir, 'sessions', SESSION_ID);
    fs.mkdirSync(sessionSubDir, { recursive: true });

    // Override state root so SessionResolver finds our session.
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

    // Write meta.json so SessionResolver can find + connect.
    writeMeta(SESSION_ID, {
      sessionId: SESSION_ID,
      projectDir: '/tmp/p',
      stage: 'default',
      pid: process.pid, // our own pid — guaranteed alive
      pgid: process.pid,
      startTimeMs: Date.now(),
      socketPath: sockPath,
      createdAt: Date.now(),
      status: 'running',
    });
  };

  const makeCtx = (stdout: Writable, stderr: Writable) => ({ stdout, stderr, cwd: tmpDir });

  it('list-commands > returns commands array from daemon', async () => {
    vi.spyOn(session, 'listCommands').mockReturnValue([
      {
        spec: { name: 'app', command: 'echo', autostart: true, killable: true },
        status: CommandStatus.STOPPED,
      },
    ] as never);

    await startServer();

    const cmd = new ListCommandsCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(['--session', SESSION_ID], makeCtx(out.stream, err.stream));

    expect(code).toBe(0);
    const parsed = JSON.parse(out.data().trim());
    expect(parsed.commands).toHaveLength(1);
    expect(parsed.commands[0].spec.name).toBe('app');
  });

  it('get-command-status > returns CommandStatus enum value', async () => {
    vi.spyOn(session, 'getCommandStatus').mockReturnValue(CommandStatus.RUNNING as never);

    await startServer();

    const cmd = new GetCommandStatusCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(
      ['--session', SESSION_ID, '--command-name', 'app'],
      makeCtx(out.stream, err.stream),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out.data().trim());
    expect(parsed.status).toBe(CommandStatus.RUNNING);
  });

  it('read-command-logs > returns lines[] (covers limit)', async () => {
    vi.spyOn(session, 'readCommandLogs').mockResolvedValue(['line1', 'line2', 'line3'] as never);

    await startServer();

    const cmd = new ReadCommandLogsCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(
      ['--session', SESSION_ID, '--command-name', 'app', '--limit', '3'],
      makeCtx(out.stream, err.stream),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out.data().trim());
    expect(parsed.lines).toEqual(['line1', 'line2', 'line3']);
  });

  it('wait-for-next-ready > blocks until next ready transition', async () => {
    vi.spyOn(session, 'waitForNextReady').mockResolvedValue({
      state: 'ready',
      durationMs: 150,
    } as never);

    await startServer();

    const cmd = new WaitForNextReadyCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(
      ['--session', SESSION_ID, '--timeout', '5000'],
      makeCtx(out.stream, err.stream),
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(out.data().trim());
    expect(parsed.state).toBe('ready');
    expect(parsed.durationMs).toBe(150);
  });

  it('help > wait-for-ready --help-json emits valid JSON with input+output', async () => {
    const cmd = new WaitForReadyCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(['--help-json'], makeCtx(out.stream, err.stream));

    expect(code).toBe(0);
    // Must parse without throwing.
    const parsed: unknown = JSON.parse(out.data().trim());
    expect(parsed).toMatchObject({
      name: 'wait-for-ready',
      description: expect.any(String),
    });
  });

  it('get-command-status > returns exit 2 when --command-name missing', async () => {
    await startServer();

    const cmd = new GetCommandStatusCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(['--session', SESSION_ID], makeCtx(out.stream, err.stream));

    expect(code).toBe(2);
    const parsed = JSON.parse(err.data().trim());
    expect(parsed.error).toMatch(/--command-name/);
  });

  it('read-command-logs > passes through since param for forward-compat', async () => {
    const spy = vi.spyOn(session, 'readCommandLogs').mockResolvedValue(['a'] as never);

    await startServer();

    const cmd = new ReadCommandLogsCommand();
    const out = makeWritable();
    const err = makeWritable();
    await cmd.execute(
      ['--session', SESSION_ID, '--command-name', 'app', '--since', '1234567890'],
      makeCtx(out.stream, err.stream),
    );

    // Verify since was passed to the daemon (and forwarded to session).
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ since: 1234567890 }));
  });
});
