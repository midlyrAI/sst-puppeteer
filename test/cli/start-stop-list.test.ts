// We test the StartCommand orchestration logic by stubbing `spawnDaemon`. The
// real child-process spawn is exercised in Chunk 5 via the e2e test. The
// adapter-factory injection seam on DaemonEntryCommand cannot reach a spawned
// child from the test process, so direct stub of spawnDaemon is the only
// viable path here. See plan §9 + Chunk 2 commentary.

import * as fs from 'node:fs';
import * as net from 'node:net';
import * as crypto from 'node:crypto';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NotImplementedError,
  SSTSession,
  type Pty,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
} from '../../src/core/index.js';
import { IpcServer } from '../../src/cli/daemon/ipc-server.js';
import { StartCommand } from '../../src/cli/commands/start-command.js';
import { StopCommand } from '../../src/cli/commands/stop-command.js';
import { ListSessionsCommand } from '../../src/cli/commands/list-sessions-command.js';
import { readMeta, writeMeta } from '../../src/cli/state/meta.js';
import { allSessionDirs, sessionDir, socketPath } from '../../src/cli/state/paths.js';
import { type CliContext } from '../../src/cli/commands/command.js';

class StubPty implements Pty {
  readonly pid: number | null = null;
  async spawn(_o: PtySpawnOptions): Promise<void> {
    throw new NotImplementedError('stub.spawn');
  }
  write(_d: string): void {
    // noop
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

const drain = (s: PassThrough): string => {
  const chunks: Buffer[] = [];
  let c: Buffer | string | null;
  while ((c = s.read()) !== null) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf-8');
};

const makeCtx = (): { ctx: CliContext; out: PassThrough; err: PassThrough } => {
  const out = new PassThrough();
  const err = new PassThrough();
  return { ctx: { stdout: out, stderr: err, cwd: '/tmp' }, out, err };
};

describe('start-stop-list', () => {
  let stateDir: string;
  let inProcServer: IpcServer | null = null;
  let inProcSession: SSTSession | null = null;
  let fakePid: number;

  beforeEach(() => {
    // Use /tmp directly (not os.tmpdir) to keep UDS paths under macOS 104-byte limit.
    stateDir = fs.mkdtempSync('/tmp/sstp-');
    vi.stubEnv('SST_PUPPETEER_STATE_ROOT', stateDir);
    fakePid = process.pid; // current pid is always alive
  });

  afterEach(async () => {
    if (inProcServer !== null) {
      await inProcServer.stop();
      inProcServer = null;
    }
    if (inProcSession !== null) {
      try {
        await inProcSession.stop();
      } catch {
        // ignore
      }
      inProcSession = null;
    }
    vi.unstubAllEnvs();
    try {
      fs.rmSync(stateDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // Stand up an in-process IpcServer for a given sessionId. The fake daemon
  // pid is the test process pid (guaranteed alive).
  const standUpDaemon = async (sessionId: string): Promise<void> => {
    fs.mkdirSync(sessionDir(sessionId), { recursive: true });
    inProcSession = new SSTSession({ adapter: new StubPty(), projectDir: '/tmp/p' });
    vi.spyOn(inProcSession, 'waitForReady').mockResolvedValue({ state: 'ready', durationMs: 1 });
    vi.spyOn(inProcSession, 'stop').mockResolvedValue(undefined);
    inProcServer = new IpcServer(inProcSession, socketPath(sessionId));
    await inProcServer.start();
  };

  it('Test 8/9: start spawns daemon (stubbed), meta.json written, socket reachable, blocking mode prints status:ready', async () => {
    const sessionIds: string[] = [];
    const stubSpawn = vi.fn(async (opts: { sessionId: string }) => {
      sessionIds.push(opts.sessionId);
      await standUpDaemon(opts.sessionId);
      return { pid: fakePid, startTimeMs: Date.now() };
    });
    const cmd = new StartCommand(stubSpawn as never);
    const { ctx, out, err } = makeCtx();
    const code = await cmd.execute(['/tmp/projectA', '--stage', 'dev'], ctx);
    expect(code).toBe(0);
    expect(stubSpawn).toHaveBeenCalledOnce();
    expect(err.read()).toBeNull();
    const outStr = drain(out);
    const parsed = JSON.parse(outStr.trim()) as { status: string; sessionId: string };
    expect(parsed.status).toBe('ready');
    expect(parsed.sessionId).toBe(sessionIds[0]);

    // meta.json was written with running status and pid
    const meta = readMeta(parsed.sessionId);
    expect(meta.status).toBe('running');
    expect(meta.pid).toBe(fakePid);
    // socket is reachable
    const sock = net.connect(meta.socketPath);
    await new Promise<void>((resolve, reject) => {
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', reject);
    });
  });

  it('Test 10: stop sends stop_session, dir cleaned', async () => {
    // Manually create a "live" session
    const sid = crypto.randomUUID();
    await standUpDaemon(sid);
    const sock = socketPath(sid);
    writeMeta(sid, {
      sessionId: sid,
      projectDir: '/tmp/p',
      stage: 'default',
      pid: fakePid,
      pgid: fakePid,
      startTimeMs: Date.now(),
      socketPath: sock,
      createdAt: Date.now(),
      status: 'running',
    });

    const cmd = new StopCommand();
    const { ctx, out } = makeCtx();
    const code = await cmd.execute(['--session', sid], ctx);
    expect(code).toBe(0);
    const result = JSON.parse(drain(out).trim()) as { stopped: boolean };
    expect(result.stopped).toBe(true);
    expect(fs.existsSync(sessionDir(sid))).toBe(false);
  });

  it('Test 11: list returns running sessions with state', async () => {
    const sid = crypto.randomUUID();
    await standUpDaemon(sid);
    writeMeta(sid, {
      sessionId: sid,
      projectDir: '/tmp/p',
      stage: 'default',
      pid: fakePid,
      pgid: fakePid,
      startTimeMs: Date.now(),
      socketPath: socketPath(sid),
      createdAt: Date.now(),
      status: 'running',
    });

    const cmd = new ListSessionsCommand();
    const { ctx, out } = makeCtx();
    const code = await cmd.execute([], ctx);
    expect(code).toBe(0);
    const parsed = JSON.parse(drain(out).trim()) as {
      sessions: { sessionId: string; status: string }[];
    };
    expect(parsed.sessions.find((s) => s.sessionId === sid)?.status).toBe('running');

    // sanity: allSessionDirs includes it
    expect(allSessionDirs()).toContain(sid);
  });
});
