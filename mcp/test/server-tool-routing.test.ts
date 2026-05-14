import { describe, expect, it } from 'vitest';
import {
  type McpServer,
  Transport,
  createMcpServer,
  defaultRegistry,
  type SessionManager,
} from '../src/index.js';
import { type IpcClient } from '../../shared/src/session/index.js';
import {
  type SessionRecord,
  type StartOrAttachOpts,
  type StartOrAttachResult,
} from '../../shared/src/session/manager.js';

// ─── Fakes ──────────────────────────────────────────────────────────────────

class MockTransport extends Transport {
  override async start(): Promise<void> {}
  override async stop(): Promise<void> {}
}

interface CallRecord {
  readonly method: string;
  readonly params: Record<string, unknown>;
}

/**
 * Stand-in for `IpcClient` that records the calls it receives and returns
 * canned per-method responses. We construct an object whose structural shape
 * matches `IpcClient` and cast to it.
 */
const makeFakeClient = (
  responses: Partial<Record<string, unknown>>,
  recorder: CallRecord[],
): IpcClient => {
  let closed = false;
  const obj = {
    call: async (method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
      recorder.push({ method, params });
      if (!(method in responses)) {
        throw new Error(`fake client: no canned response for ${method}`);
      }
      return responses[method];
    },
    close: (): void => {
      closed = true;
    },
    get _closed(): boolean {
      return closed;
    },
  };
  return obj as unknown as IpcClient;
};

interface FakeManagerState {
  startCalls: StartOrAttachOpts[];
  stopCalls: string[];
  connectCalls: string[];
  clientCalls: CallRecord[];
  startResult: StartOrAttachResult;
  listResult: SessionRecord[];
  connectError: Error | null;
  responses: Partial<Record<string, unknown>>;
}

const buildFakeManager = (
  initial: Partial<FakeManagerState> = {},
): { manager: SessionManager; state: FakeManagerState } => {
  const state: FakeManagerState = {
    startCalls: [],
    stopCalls: [],
    connectCalls: [],
    clientCalls: [],
    startResult: { status: 'ready', sessionId: 's1', reused: false },
    listResult: [],
    connectError: null,
    responses: {},
    ...initial,
  };
  const fake = {
    startOrAttach: async (opts: StartOrAttachOpts): Promise<StartOrAttachResult> => {
      state.startCalls.push(opts);
      return state.startResult;
    },
    list: async (): Promise<SessionRecord[]> => state.listResult,
    stop: async (sessionId: string): Promise<{ stopped: true }> => {
      state.stopCalls.push(sessionId);
      return { stopped: true };
    },
    connect: async (sessionId: string): Promise<IpcClient> => {
      state.connectCalls.push(sessionId);
      if (state.connectError !== null) throw state.connectError;
      return makeFakeClient(state.responses, state.clientCalls);
    },
  };
  return { manager: fake as unknown as SessionManager, state };
};

const buildServer = (manager: SessionManager): McpServer =>
  createMcpServer({
    transport: new MockTransport(),
    sessionManager: manager,
  });

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('McpServer tool routing (_handleToolCall) — AC-7 enumerated subtests', () => {
  it('registry has all 12 tools', () => {
    const { manager } = buildFakeManager();
    const server = buildServer(manager);
    const registry = defaultRegistry();
    expect(server.registry.size()).toBe(12);
    const names = server.registry.list().map((t) => t.name);
    const expectedNames = registry.list().map((t) => t.name);
    expect(names.sort()).toEqual(expectedNames.sort());
  });

  // 1. wait_for_ready
  it('Subtest 1: wait_for_ready forwards to IpcClient.call("wait_for_ready", {timeoutMs})', async () => {
    const { manager, state } = buildFakeManager({
      responses: { wait_for_ready: { state: 'ready', durationMs: 100 } },
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('wait_for_ready', {
      sessionId: 's1',
      timeoutMs: 5000,
    });
    expect(result.isError).toBeUndefined();
    expect(state.connectCalls).toEqual(['s1']);
    expect(state.clientCalls).toEqual([{ method: 'wait_for_ready', params: { timeoutMs: 5000 } }]);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ state: 'ready', durationMs: 100 });
  });

  // 2. wait_for_next_ready
  it('Subtest 2: wait_for_next_ready forwards params (less sessionId) to wire method', async () => {
    const { manager, state } = buildFakeManager({
      responses: { wait_for_next_ready: { state: 'ready', durationMs: 250 } },
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('wait_for_next_ready', {
      sessionId: 's1',
      timeoutMs: 5000,
      commandName: 'api',
    });
    expect(result.isError).toBeUndefined();
    expect(state.connectCalls).toEqual(['s1']);
    expect(state.clientCalls).toEqual([
      { method: 'wait_for_next_ready', params: { timeoutMs: 5000, commandName: 'api' } },
    ]);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ state: 'ready', durationMs: 250 });
  });

  // 3. list_commands
  it('Subtest 3: list_commands forwards to wire with empty params', async () => {
    const { manager, state } = buildFakeManager({
      responses: { list_commands: { commands: [] } },
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('list_commands', { sessionId: 's1' });
    expect(result.isError).toBeUndefined();
    expect(state.connectCalls).toEqual(['s1']);
    expect(state.clientCalls).toEqual([{ method: 'list_commands', params: {} }]);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ commands: [] });
  });

  // 4. get_command_status
  it('Subtest 4: get_command_status forwards commandName', async () => {
    const { manager, state } = buildFakeManager({
      responses: { get_command_status: { status: 'running' } },
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('get_command_status', {
      sessionId: 's1',
      commandName: 'api',
    });
    expect(result.isError).toBeUndefined();
    expect(state.clientCalls).toEqual([
      { method: 'get_command_status', params: { commandName: 'api' } },
    ]);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ status: 'running' });
  });

  // 5. start_command
  it('Subtest 5: start_command forwards commandName', async () => {
    const { manager, state } = buildFakeManager({
      responses: { start_command: { status: 'running', durationMs: 1500 } },
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('start_command', {
      sessionId: 's1',
      commandName: 'api',
    });
    expect(result.isError).toBeUndefined();
    expect(state.clientCalls).toEqual([
      { method: 'start_command', params: { commandName: 'api' } },
    ]);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ status: 'running', durationMs: 1500 });
  });

  // 6. stop_command
  it('Subtest 6: stop_command forwards commandName', async () => {
    const { manager, state } = buildFakeManager({
      responses: { stop_command: { status: 'stopped' } },
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('stop_command', {
      sessionId: 's1',
      commandName: 'api',
    });
    expect(result.isError).toBeUndefined();
    expect(state.clientCalls).toEqual([{ method: 'stop_command', params: { commandName: 'api' } }]);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ status: 'stopped' });
  });

  // 7. restart_command
  it('Subtest 7: restart_command forwards commandName', async () => {
    const { manager, state } = buildFakeManager({
      responses: { restart_command: { status: 'running', durationMs: 2000 } },
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('restart_command', {
      sessionId: 's1',
      commandName: 'api',
    });
    expect(result.isError).toBeUndefined();
    expect(state.clientCalls).toEqual([
      { method: 'restart_command', params: { commandName: 'api' } },
    ]);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ status: 'running', durationMs: 2000 });
  });

  // 8. read_command_logs
  it('Subtest 8: read_command_logs forwards commandName + optional since/tail', async () => {
    const { manager, state } = buildFakeManager({
      responses: { read_command_logs: { lines: ['l1', 'l2'] } },
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('read_command_logs', {
      sessionId: 's1',
      commandName: 'api',
      tail: 50,
    });
    expect(result.isError).toBeUndefined();
    expect(state.clientCalls).toEqual([
      { method: 'read_command_logs', params: { commandName: 'api', tail: 50 } },
    ]);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ lines: ['l1', 'l2'] });
  });

  // 9. stop_session — delegated to manager.stop() (not connect)
  it('Subtest 9: stop_session calls manager.stop and does NOT open a client', async () => {
    const { manager, state } = buildFakeManager();
    const server = buildServer(manager);
    const result = await server._handleToolCall('stop_session', { sessionId: 's1' });
    expect(result.isError).toBeUndefined();
    expect(state.stopCalls).toEqual(['s1']);
    expect(state.connectCalls).toEqual([]);
    expect(JSON.parse(result.content[0]!.text)).toEqual({ stopped: true });
  });

  // 10. start_session — delegates to manager.startOrAttach()
  it('Subtest 10: start_session delegates to manager.startOrAttach, response includes reused/status', async () => {
    const { manager, state } = buildFakeManager({
      startResult: { status: 'ready', sessionId: 'abc-123', reused: true },
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('start_session', {
      projectDir: '/tmp/test-project',
      stage: 'dev',
    });
    expect(result.isError).toBeUndefined();
    expect(state.startCalls.length).toBe(1);
    expect(state.startCalls[0]!.projectDir).toBe('/tmp/test-project');
    expect(state.startCalls[0]!.stage).toBe('dev');
    expect(state.startCalls[0]!.wait).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      sessionId: 'abc-123',
      reused: true,
      status: 'ready',
    });
  });

  // 11. list_sessions — delegates to manager.list()
  it('Subtest 11: list_sessions returns manager.list() records with synthesized state', async () => {
    const records: SessionRecord[] = [
      {
        sessionId: 's1',
        projectDir: '/p',
        stage: 'default',
        pid: 1234,
        pgid: 1234,
        startTimeMs: 1000,
        socketPath: '/tmp/s1.sock',
        createdAt: 999,
        status: 'running',
        state: 'ready',
        liveness: { pidAlive: true, socketAlive: true },
        startedAt: 1000,
        lastUpdatedAt: 1001,
      },
    ];
    const { manager } = buildFakeManager({ listResult: records });
    const server = buildServer(manager);
    const result = await server._handleToolCall('list_sessions', {});
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0]!.text) as {
      sessions: ReadonlyArray<{
        sessionId: string;
        projectDir: string;
        stage?: string;
        state: string;
        startedAt: number;
        lastUpdatedAt?: number;
      }>;
    };
    expect(parsed.sessions).toEqual([
      {
        sessionId: 's1',
        projectDir: '/p',
        stage: 'default',
        state: 'ready',
        startedAt: 1000,
        lastUpdatedAt: 1001,
      },
    ]);
  });

  // 12. Error path: unknown sessionId surfaces as isError
  it('Subtest 12: unknown sessionId (manager.connect throws) returns isError=true', async () => {
    const { manager } = buildFakeManager({
      connectError: new Error('No session with that id'),
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('wait_for_ready', { sessionId: 'unknown-id' });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as { error: string };
    expect(parsed.error).toContain('No session with that id');
  });

  // 13. Error path: unknown tool name
  it('Subtest 13: unknown tool name returns isError=true', async () => {
    const { manager } = buildFakeManager();
    const server = buildServer(manager);
    const result = await server._handleToolCall('completely_unknown_tool', { sessionId: 's1' });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as { error: string };
    expect(parsed.error).toContain('completely_unknown_tool');
  });
});

describe('McpServer additional coverage', () => {
  it('start_session with status=failed includes error in payload', async () => {
    const { manager } = buildFakeManager({
      startResult: {
        status: 'failed',
        sessionId: 'sid',
        reused: false,
        error: 'daemon spawn failed: ENOENT',
      },
    });
    const server = buildServer(manager);
    const result = await server._handleToolCall('start_session', {
      projectDir: '/tmp/test-project',
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      sessionId: 'sid',
      reused: false,
      status: 'failed',
      error: 'daemon spawn failed: ENOENT',
    });
  });

  it('start_session invalid input returns isError=true via _validationError', async () => {
    const { manager } = buildFakeManager();
    const server = buildServer(manager);
    const result = await server._handleToolCall('start_session', {} as never);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as { error: string };
    expect(parsed.error).toContain('start_session');
  });

  it('passthrough tool closes the IpcClient after execute', async () => {
    const recorder: CallRecord[] = [];
    const fakeClient = makeFakeClient({ list_commands: { commands: [] } }, recorder);
    const fakeManager = {
      startOrAttach: async () => ({ status: 'ready' as const, sessionId: 's1', reused: false }),
      list: async () => [],
      stop: async () => ({ stopped: true as const }),
      connect: async () => fakeClient,
    } as unknown as SessionManager;
    const server = buildServer(fakeManager);
    await server._handleToolCall('list_commands', { sessionId: 's1' });
    expect((fakeClient as unknown as { _closed: boolean })._closed).toBe(true);
  });

  it('tool requiring sessionId without one returns isError=true', async () => {
    const { manager } = buildFakeManager();
    const server = buildServer(manager);
    const result = await server._handleToolCall('list_commands', {});
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0]!.text) as { error: string };
    expect(parsed.error).toContain('requires a sessionId');
  });
});
