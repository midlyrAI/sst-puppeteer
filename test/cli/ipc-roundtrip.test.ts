import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
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
import { IpcClient } from '../../src/cli/daemon/ipc-client.js';
import { IpcServer } from '../../src/cli/daemon/ipc-server.js';

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

describe('ipc-roundtrip', () => {
  let tmpDir: string;
  let sockPath: string;
  let server: IpcServer | null = null;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipcrt-'));
    sockPath = path.join(tmpDir, 'daemon.sock');
  });

  afterEach(async () => {
    if (server !== null) {
      await server.stop();
      server = null;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('Test 4: client sends wait_for_ready and receives state+durationMs', async () => {
    const session = buildStubSession();
    vi.spyOn(session, 'waitForReady').mockResolvedValue({ state: 'ready', durationMs: 42 });
    server = new IpcServer(session, sockPath);
    await server.start();
    const client = await IpcClient.connect(sockPath);
    const result = (await client.call('wait_for_ready', { timeoutMs: 5000 })) as {
      state: string;
      durationMs: number;
    };
    expect(result.state).toBe('ready');
    expect(result.durationMs).toBe(42);
    client.close();
  });

  it('Test 5: client receives error envelope for unknown method', async () => {
    const session = buildStubSession();
    server = new IpcServer(session, sockPath);
    await server.start();
    const client = await IpcClient.connect(sockPath);
    await expect(client.call('totally_fake_method', {})).rejects.toThrow();
    client.close();
  });

  it('Test 6: concurrent clients are served independently', async () => {
    const session = buildStubSession();
    vi.spyOn(session, 'listCommands').mockReturnValue([
      {
        spec: { name: 'a', kind: 'service', command: 'echo', autostart: false, killable: true },
        status: CommandStatus.STOPPED,
      },
    ] as never);
    server = new IpcServer(session, sockPath);
    await server.start();

    const c1 = await IpcClient.connect(sockPath);
    const c2 = await IpcClient.connect(sockPath);
    const [r1, r2] = await Promise.all([
      c1.call('list_commands', {}),
      c2.call('list_commands', {}),
    ]);
    expect((r1 as { commands: unknown[] }).commands).toHaveLength(1);
    expect((r2 as { commands: unknown[] }).commands).toHaveLength(1);
    c1.close();
    c2.close();
  });

  it('Test 7: client disconnects mid wait_for_ready; daemon detects EPIPE and emits abort log', async () => {
    const session = buildStubSession();
    // waitForReady never resolves until aborted
    vi.spyOn(session, 'waitForReady').mockImplementation(
      () => new Promise(() => undefined) as Promise<{ state: 'ready'; durationMs: number }>,
    );
    server = new IpcServer(session, sockPath);
    await server.start();

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // Raw socket so we can send + abruptly destroy
    const sock = net.connect(sockPath);
    await new Promise<void>((resolve) => sock.once('connect', () => resolve()));
    sock.write(JSON.stringify({ id: 'x', method: 'wait_for_ready', params: {} }) + '\n');
    await new Promise((r) => setTimeout(r, 50));
    sock.destroy();
    await new Promise((r) => setTimeout(r, 100));

    const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('disconnect') || c.includes('aborted'))).toBe(true);
    stderrSpy.mockRestore();
  });
});
