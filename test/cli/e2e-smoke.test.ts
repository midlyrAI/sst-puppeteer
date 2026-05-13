// Test #28 — e2e-smoke > start --no-wait -> list -> stop lifecycle
//
// Strategy: import CliRunner + defaultRegistry directly. Stub spawnDaemon so we
// don't fork a real child process — real fork spawn is exercised by the unit +
// integration tests in start-stop-list.test.ts and spawn-dev-mode.test.ts.
// An in-process IpcServer stands in for the daemon, making the test fast and
// hermetic while still exercising the full CLI → IPC → session resolver path.

import * as fs from 'node:fs';
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
import { IpcServer } from '../../src/session/ipc-server.js';
import { StartCommand } from '../../src/cli/commands/start-command.js';
import { StopCommand } from '../../src/cli/commands/stop-command.js';
import { ListSessionsCommand } from '../../src/cli/commands/list-sessions-command.js';
import { writeMeta } from '../../src/session/meta.js';
import { sessionDir, socketPath } from '../../src/session/paths.js';
import { CommandRegistry } from '../../src/cli/commands/registry.js';
import { VersionCommand } from '../../src/cli/commands/version-command.js';
import { CliRunner } from '../../src/cli/runner.js';
import { type CliContext } from '../../src/cli/commands/command.js';

class StubPty implements Pty {
  readonly pid: number | null = null;
  async spawn(_o: PtySpawnOptions): Promise<void> {
    throw new NotImplementedError('stub.spawn');
  }
  write(_d: string): void {}
  onData(_h: PtyDataHandler): PtyUnsubscribe {
    return () => {};
  }
  onExit(_h: PtyExitHandler): PtyUnsubscribe {
    return () => {};
  }
  resize(_c: number, _r: number): void {}
  kill(): void {}
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

describe('e2e-smoke', () => {
  let stateDir: string;
  let inProcServer: IpcServer | null = null;
  let inProcSession: SSTSession | null = null;
  const fakePid = process.pid; // guaranteed alive

  beforeEach(() => {
    stateDir = fs.mkdtempSync('/tmp/sstp-e2e-');
    vi.stubEnv('SST_PUPPETEER_STATE_ROOT', stateDir);
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
        /* ignore */
      }
      inProcSession = null;
    }
    vi.unstubAllEnvs();
    try {
      fs.rmSync(stateDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const standUpDaemon = async (sessionId: string): Promise<void> => {
    fs.mkdirSync(sessionDir(sessionId), { recursive: true });
    inProcSession = new SSTSession({ adapter: new StubPty(), projectDir: '/tmp/p' });
    vi.spyOn(inProcSession, 'waitForReady').mockResolvedValue({ state: 'ready', durationMs: 1 });
    vi.spyOn(inProcSession, 'stop').mockResolvedValue(undefined);
    inProcServer = new IpcServer(inProcSession, socketPath(sessionId));
    await inProcServer.start();
  };

  it('Test #28: start --no-wait -> list -> stop lifecycle', async () => {
    // Build a custom registry that injects a stubbed spawnDaemon into StartCommand.
    // This avoids forking a real child process during the test run.
    const capturedSessionIds: string[] = [];

    const stubSpawn = vi.fn(async (opts: { sessionId: string }) => {
      capturedSessionIds.push(opts.sessionId);
      await standUpDaemon(opts.sessionId);
      // Write meta so list + stop can find the session
      writeMeta(opts.sessionId, {
        sessionId: opts.sessionId,
        projectDir: '/tmp/e2e-project',
        stage: 'test',
        pid: fakePid,
        pgid: fakePid,
        startTimeMs: Date.now(),
        socketPath: socketPath(opts.sessionId),
        createdAt: Date.now(),
        status: 'running',
      });
      return { pid: fakePid, startTimeMs: Date.now() };
    });

    const registry = new CommandRegistry();
    registry.register(new VersionCommand());
    registry.register(new StartCommand(stubSpawn as never));
    registry.register(new StopCommand());
    registry.register(new ListSessionsCommand());

    // --- Phase 1: start --no-wait ---
    {
      const { ctx, out, err } = makeCtx();
      const runner = new CliRunner({ registry, ctx });
      const code = await runner.run([
        'node',
        'cli',
        'start',
        '/tmp/e2e-project',
        '--stage',
        'test',
        '--no-wait',
      ]);
      expect(code).toBe(0);
      expect(drain(err)).toBe('');
      const startOut = drain(out).trim();
      const startResult = JSON.parse(startOut) as { sessionId: string; status: string };
      expect(startResult.status).toBe('started');
      expect(typeof startResult.sessionId).toBe('string');
    }

    expect(capturedSessionIds).toHaveLength(1);
    const sessionId = capturedSessionIds[0]!;

    // --- Phase 2: list -> assert one session present ---
    {
      const { ctx, out } = makeCtx();
      const runner = new CliRunner({ registry, ctx });
      const code = await runner.run(['node', 'cli', 'list']);
      expect(code).toBe(0);
      const listResult = JSON.parse(drain(out).trim()) as {
        sessions: { sessionId: string; status: string }[];
      };
      const found = listResult.sessions.find((s) => s.sessionId === sessionId);
      expect(found).toBeDefined();
      expect(found!.status).toBe('running');
    }

    // --- Phase 3: stop --session <id> ---
    {
      const { ctx, out, err } = makeCtx();
      const runner = new CliRunner({ registry, ctx });
      const code = await runner.run(['node', 'cli', 'stop', '--session', sessionId]);
      expect(code).toBe(0);
      expect(drain(err)).toBe('');
      const stopResult = JSON.parse(drain(out).trim()) as { stopped: boolean };
      expect(stopResult.stopped).toBe(true);
      // The stop command removes the session dir
      expect(fs.existsSync(sessionDir(sessionId))).toBe(false);
    }

    // --- Phase 4: list again -> sessions empty ---
    {
      const { ctx, out } = makeCtx();
      const runner = new CliRunner({ registry, ctx });
      const code = await runner.run(['node', 'cli', 'list']);
      expect(code).toBe(0);
      const listResult2 = JSON.parse(drain(out).trim()) as {
        sessions: { sessionId: string; status: string }[];
      };
      const running = listResult2.sessions.filter((s) => s.status === 'running');
      expect(running).toHaveLength(0);
    }
  });
});
