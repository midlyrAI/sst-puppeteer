import { describe, expect, it, vi } from 'vitest';
import {
  NotImplementedError,
  type CommandSpec,
  type Pty,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
  SSTSession,
} from '@sst-puppeteer/core';
import { type McpServer, Transport, createMcpServer, defaultRegistry } from '../src/index.js';
import { type SessionFactory } from '../src/server.js';

class StubPty implements Pty {
  readonly pid: number | null = null;
  async spawn(_o: PtySpawnOptions): Promise<void> {
    throw new NotImplementedError('stub.spawn');
  }
  write(_d: string): void {
    throw new NotImplementedError('stub.write');
  }
  onData(_h: PtyDataHandler): PtyUnsubscribe {
    throw new NotImplementedError('stub.onData');
  }
  onExit(_h: PtyExitHandler): PtyUnsubscribe {
    throw new NotImplementedError('stub.onExit');
  }
  resize(_c: number, _r: number): void {
    throw new NotImplementedError('stub.resize');
  }
  kill(): void {
    throw new NotImplementedError('stub.kill');
  }
}

class MockTransport extends Transport {
  override async start(): Promise<void> {}
  override async stop(): Promise<void> {}
}

const buildStubSession = (): SSTSession =>
  new SSTSession({
    adapter: new StubPty(),
    projectDir: '/tmp/test-project',
  });

const buildServer = (overrideSessionFactory?: SessionFactory): McpServer => {
  const sessionFactory: SessionFactory = overrideSessionFactory ?? (async () => buildStubSession());
  return createMcpServer({
    transport: new MockTransport(),
    sessionFactory,
  });
};

describe('McpServer tool routing (_handleToolCall)', () => {
  it('Test 1: tools/list returns 10 tools with correct names', () => {
    const server = buildServer();
    const registry = defaultRegistry();
    expect(server.registry.size()).toBe(10);
    const names = server.registry.list().map((t) => t.name);
    const expectedNames = registry.list().map((t) => t.name);
    expect(names.sort()).toEqual(expectedNames.sort());
  });

  it('Test 2: start_session creates a session and returns a sessionId', async () => {
    const mockSession = buildStubSession();
    const startSpy = vi.spyOn(mockSession, 'start').mockResolvedValue(undefined);
    const sessionFactory: SessionFactory = async () => mockSession;

    const server = buildServer(sessionFactory);
    const result = await server._handleToolCall('start_session', {
      projectDir: '/tmp/test-project',
    });

    expect(result.isError).toBeUndefined();
    expect(startSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(result.content[0]!.text) as { sessionId: string };
    expect(typeof parsed.sessionId).toBe('string');
    expect(parsed.sessionId).toBe(mockSession.id);
    // Session should be stored
    expect(server.getSession(mockSession.id)).toBe(mockSession);
  });

  it('Test 3: wait_for_ready routes to WaitForReadyTool.execute with valid sessionId', async () => {
    const mockSession = buildStubSession();
    vi.spyOn(mockSession, 'start').mockResolvedValue(undefined);
    const sessionFactory: SessionFactory = async () => mockSession;

    const server = buildServer(sessionFactory);
    // First start a session
    await server._handleToolCall('start_session', { projectDir: '/tmp/test-project' });

    // Now mock waitForReady
    const waitSpy = vi.spyOn(mockSession, 'waitForReady').mockResolvedValue({
      state: 'ready',
      durationMs: 100,
    });

    const result = await server._handleToolCall('wait_for_ready', {
      sessionId: mockSession.id,
      timeoutMs: 5000,
    });

    expect(result.isError).toBeUndefined();
    expect(waitSpy).toHaveBeenCalledWith({ timeoutMs: 5000 });
    const parsed = JSON.parse(result.content[0]!.text) as { state: string; durationMs: number };
    expect(parsed.state).toBe('ready');
    expect(parsed.durationMs).toBe(100);
  });

  it('Test 4: unknown sessionId returns isError=true', async () => {
    const server = buildServer();
    const result = await server._handleToolCall('wait_for_ready', {
      sessionId: 'nonexistent-session-id',
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as { error: string };
    expect(parsed.error).toContain('nonexistent-session-id');
  });

  it('Test 5: unknown tool name returns isError=true', async () => {
    const server = buildServer();
    const result = await server._handleToolCall('completely_unknown_tool', { sessionId: 'x' });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as { error: string };
    expect(parsed.error).toContain('completely_unknown_tool');
  });

  it('Test 6: start_session passes commands to sessionFactory', async () => {
    const commands: readonly CommandSpec[] = [
      { name: 'A', kind: 'service', command: 'echo', autostart: false, killable: true },
    ];

    const mockSession = buildStubSession();
    vi.spyOn(mockSession, 'start').mockResolvedValue(undefined);

    let capturedOpts: { projectDir: string; commands?: readonly CommandSpec[] } | undefined;
    const sessionFactory: SessionFactory = async (opts) => {
      capturedOpts = opts;
      return mockSession;
    };

    const server = buildServer(sessionFactory);
    const result = await server._handleToolCall('start_session', {
      projectDir: '/tmp',
      commands,
    });

    expect(result.isError).toBeUndefined();
    expect(capturedOpts).toBeDefined();
    expect(capturedOpts!.commands).toEqual(commands);
  });
});
