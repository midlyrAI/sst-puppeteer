/**
 * Cross-surface integration tests — AC-1..AC-6 from
 * `.omc/specs/deep-interview-shared-session-store.md`.
 *
 * Strategy: every scenario runs against a fresh `SST_PUPPETEER_STATE_ROOT`
 * tmpdir. CLI calls are real `tsx test/helpers/cli-child.ts` child
 * processes; MCP calls are either an in-process `McpServer` (scenarios
 * 1/2/4/5/6) or a real child Node MCP process via `McpChildProcess`
 * (scenario 3 — proves AC-3's MCP-restart guarantee).
 *
 * The fake daemon (`fake-spawn-daemon.ts`) keeps tests hermetic: no
 * `sst dev` is launched, no AWS calls. The shared on-disk meta and the
 * real UDS handshake are exercised end-to-end.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import * as url from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../../src/mcp/index.js';
import { SessionManager } from '../../src/session/index.js';
import { assertStateIsolated } from '../helpers/state-isolation.js';
import { fakeSpawnDaemon } from '../helpers/fake-spawn-daemon.js';
import { McpChildProcess } from '../helpers/mcp-child-process.js';

const here = url.fileURLToPath(import.meta.url);
const cliChildEntry = path.resolve(path.dirname(here), '..', 'helpers', 'cli-child.ts');

const repoRoot = path.resolve(path.dirname(here), '..', '..');

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

const runCliChild = (args: readonly string[], env: NodeJS.ProcessEnv): Promise<CliResult> => {
  return new Promise<CliResult>((resolve, reject) => {
    const child = nodeSpawn(process.execPath, ['--import', 'tsx', cliChildEntry, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      cwd: repoRoot,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString('utf-8');
    });
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString('utf-8');
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
};

const inProcMcp = (
  stateRoot: string,
): { server: ReturnType<typeof createMcpServer>; stop: () => Promise<void> } => {
  // Build the MCP server with a SessionManager that uses fakeSpawnDaemon
  // and inherits SST_PUPPETEER_STATE_ROOT from the test process.
  process.env['SST_PUPPETEER_STATE_ROOT'] = stateRoot;
  const sessionManager = new SessionManager({ spawnDaemon: fakeSpawnDaemon });
  const server = createMcpServer({
    transport: {
      // Minimal stub transport — we drive `_handleToolCall` directly.
      start: async () => {},
      stop: async () => {},
      getSdkTransport: () => ({}) as never,
    } as never,
    sessionManager,
  });
  return {
    server,
    stop: async () => {
      // No real transport started; nothing to clean up.
    },
  };
};

const findDaemonPid = (stateRoot: string, sessionId: string): number | null => {
  const metaPath = path.join(stateRoot, 'sessions', sessionId, 'meta.json');
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { pid: number | null };
    return meta.pid;
  } catch {
    return null;
  }
};

const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const killPidIfAlive = (pid: number | null): void => {
  if (pid === null) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* ignore */
  }
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('cross-surface integration', () => {
  let stateRoot: string;
  const spawnedPids: number[] = [];

  beforeEach(() => {
    // Short tmp path to keep UDS socket under macOS 104-byte limit.
    stateRoot = fs.mkdtempSync('/tmp/sstp-xs-');
    process.env['SST_PUPPETEER_STATE_ROOT'] = stateRoot;
    assertStateIsolated();
    spawnedPids.length = 0;
  });

  afterEach(async () => {
    // Kill any daemon pids the scenario spawned.
    for (const pid of spawnedPids) {
      killPidIfAlive(pid);
    }
    // Give daemons a beat to exit.
    await sleep(50);
    delete process.env['SST_PUPPETEER_STATE_ROOT'];
    try {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  // ---------------------------------------------------------------------------
  // AC-1: CLI start -> MCP list_sessions sees it.
  // ---------------------------------------------------------------------------
  it('AC-1: CLI start writes meta that MCP list_sessions reads', async () => {
    const projectDir = '/tmp/xs-ac1';
    const res = await runCliChild(['start', projectDir, '--stage', 'dev', '--no-wait'], {
      SST_PUPPETEER_STATE_ROOT: stateRoot,
    });
    expect(res.code, `cli stderr: ${res.stderr}`).toBe(0);
    const startOut = JSON.parse(res.stdout.trim()) as { sessionId: string; status: string };
    expect(startOut.status).toBe('started');
    expect(typeof startOut.sessionId).toBe('string');
    const pid = findDaemonPid(stateRoot, startOut.sessionId);
    if (pid !== null) spawnedPids.push(pid);

    // In-process MCP with the same state root.
    const { server, stop } = inProcMcp(stateRoot);
    try {
      const result = await server._handleToolCall('list_sessions', {});
      const payload = JSON.parse(result.content[0]!.text) as {
        sessions: Array<{ sessionId: string; projectDir: string; stage: string }>;
      };
      const found = payload.sessions.find((s) => s.sessionId === startOut.sessionId);
      expect(found).toBeDefined();
      expect(path.resolve(found!.projectDir)).toBe(path.resolve(projectDir));
      expect(found!.stage).toBe('dev');
    } finally {
      await stop();
    }
  }, 30_000);

  // ---------------------------------------------------------------------------
  // AC-2: MCP start_session -> CLI list sees it.
  // ---------------------------------------------------------------------------
  it('AC-2: MCP start_session writes meta that CLI list reads', async () => {
    const projectDir = '/tmp/xs-ac2';
    const { server, stop } = inProcMcp(stateRoot);
    let sessionId: string;
    try {
      const result = await server._handleToolCall('start_session', {
        projectDir,
        stage: 'staging',
      });
      const payload = JSON.parse(result.content[0]!.text) as {
        sessionId: string;
        reused: boolean;
        status: string;
      };
      sessionId = payload.sessionId;
      expect(payload.status).toBe('ready');
      expect(payload.reused).toBe(false);
      const pid = findDaemonPid(stateRoot, sessionId);
      if (pid !== null) spawnedPids.push(pid);
    } finally {
      await stop();
    }

    const res = await runCliChild(['list'], {
      SST_PUPPETEER_STATE_ROOT: stateRoot,
    });
    expect(res.code, `cli stderr: ${res.stderr}`).toBe(0);
    const listOut = JSON.parse(res.stdout.trim()) as {
      sessions: Array<{ sessionId: string; projectDir: string; stage: string }>;
    };
    const found = listOut.sessions.find((s) => s.sessionId === sessionId);
    expect(found).toBeDefined();
    expect(path.resolve(found!.projectDir)).toBe(path.resolve(projectDir));
    expect(found!.stage).toBe('staging');
  }, 30_000);

  // ---------------------------------------------------------------------------
  // AC-3: MCP child-process restart preserves sessions.
  // ---------------------------------------------------------------------------
  it('AC-3: MCP restart preserves sessions across real Node processes', async () => {
    const projectDir = '/tmp/xs-ac3';
    // Round 1: spawn MCP, start a session, kill MCP.
    const mcp1 = await McpChildProcess.start({ SST_PUPPETEER_STATE_ROOT: stateRoot });
    let sessionId: string;
    try {
      const startRes = await mcp1.callTool('start_session', {
        projectDir,
        stage: 'dev',
      });
      const startPayload = JSON.parse(startRes.content[0]!.text) as {
        sessionId: string;
        status: string;
      };
      expect(startPayload.status).toBe('ready');
      sessionId = startPayload.sessionId;
      const pid = findDaemonPid(stateRoot, sessionId);
      if (pid !== null) spawnedPids.push(pid);
    } finally {
      await mcp1.kill();
    }

    // Round 2: fresh MCP child, list_sessions should still see the session.
    const mcp2 = await McpChildProcess.start({ SST_PUPPETEER_STATE_ROOT: stateRoot });
    try {
      const listRes = await mcp2.callTool('list_sessions', {});
      const listPayload = JSON.parse(listRes.content[0]!.text) as {
        sessions: Array<{ sessionId: string; state: string }>;
      };
      const found = listPayload.sessions.find((s) => s.sessionId === sessionId);
      expect(found, 'session must survive MCP restart').toBeDefined();
      expect(found!.state).toBe('ready');

      // read_command_logs should also work post-restart.
      const logsRes = await mcp2.callTool('read_command_logs', {
        sessionId,
        commandName: 'api',
      });
      const logsPayload = JSON.parse(logsRes.content[0]!.text) as { lines: unknown[] };
      expect(Array.isArray(logsPayload.lines)).toBe(true);
    } finally {
      await mcp2.kill();
    }
  }, 60_000);

  // ---------------------------------------------------------------------------
  // AC-4: start_session idempotent across surfaces.
  // ---------------------------------------------------------------------------
  it('AC-4: CLI then MCP start for same (projectDir, stage) returns same sessionId with reused:true', async () => {
    const projectDir = '/tmp/xs-ac4-a';
    // CLI start.
    const cliRes = await runCliChild(['start', projectDir, '--stage', 'qa', '--no-wait'], {
      SST_PUPPETEER_STATE_ROOT: stateRoot,
    });
    expect(cliRes.code, `cli stderr: ${cliRes.stderr}`).toBe(0);
    const cliOut = JSON.parse(cliRes.stdout.trim()) as { sessionId: string };
    const sessionIdA = cliOut.sessionId;
    const pidA = findDaemonPid(stateRoot, sessionIdA);
    if (pidA !== null) spawnedPids.push(pidA);

    // MCP start for the same (projectDir, stage) — should reuse.
    const { server, stop } = inProcMcp(stateRoot);
    try {
      const mcpRes = await server._handleToolCall('start_session', {
        projectDir,
        stage: 'qa',
      });
      const mcpOut = JSON.parse(mcpRes.content[0]!.text) as {
        sessionId: string;
        reused: boolean;
        status: string;
      };
      expect(mcpOut.sessionId).toBe(sessionIdA);
      expect(mcpOut.reused).toBe(true);
      expect(mcpOut.status).toBe('ready');
    } finally {
      await stop();
    }

    // Reverse direction with a fresh (projectDir, stage).
    const projectDirB = '/tmp/xs-ac4-b';
    const { server: s2, stop: stop2 } = inProcMcp(stateRoot);
    let sessionIdB: string;
    try {
      const first = await s2._handleToolCall('start_session', {
        projectDir: projectDirB,
        stage: 'qa',
      });
      const firstOut = JSON.parse(first.content[0]!.text) as {
        sessionId: string;
        reused: boolean;
      };
      sessionIdB = firstOut.sessionId;
      expect(firstOut.reused).toBe(false);
      const pidB = findDaemonPid(stateRoot, sessionIdB);
      if (pidB !== null) spawnedPids.push(pidB);
    } finally {
      await stop2();
    }
    const cliRes2 = await runCliChild(['start', projectDirB, '--stage', 'qa', '--no-wait'], {
      SST_PUPPETEER_STATE_ROOT: stateRoot,
    });
    expect(cliRes2.code, `cli stderr: ${cliRes2.stderr}`).toBe(0);
    const cliOut2 = JSON.parse(cliRes2.stdout.trim()) as {
      sessionId: string;
      reused: boolean;
      status: string;
    };
    expect(cliOut2.sessionId).toBe(sessionIdB);
    expect(cliOut2.reused).toBe(true);
    expect(cliOut2.status).toBe('ready');
  }, 60_000);

  // ---------------------------------------------------------------------------
  // AC-5: Daemon survives parent CLI exit.
  // ---------------------------------------------------------------------------
  it('AC-5: daemon remains alive after the spawning CLI child exits', async () => {
    const projectDir = '/tmp/xs-ac5';
    const res = await runCliChild(['start', projectDir, '--stage', 'dev', '--no-wait'], {
      SST_PUPPETEER_STATE_ROOT: stateRoot,
    });
    expect(res.code, `cli stderr: ${res.stderr}`).toBe(0);
    const out = JSON.parse(res.stdout.trim()) as { sessionId: string };
    const sessionId = out.sessionId;

    // The CLI child has exited (we awaited its `exit`). Verify daemon pid is alive.
    const pid = findDaemonPid(stateRoot, sessionId);
    expect(pid).not.toBeNull();
    if (pid !== null) spawnedPids.push(pid);
    expect(pidAlive(pid!)).toBe(true);

    // Socket is connectable.
    const meta = JSON.parse(
      fs.readFileSync(path.join(stateRoot, 'sessions', sessionId, 'meta.json'), 'utf-8'),
    ) as { socketPath: string };
    await new Promise<void>((resolve, reject) => {
      const sock = net.connect(meta.socketPath);
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', reject);
    });
  }, 30_000);

  // ---------------------------------------------------------------------------
  // AC-6: stop_session touches only its own subdir.
  // ---------------------------------------------------------------------------
  it('AC-6: stop_session(A) leaves session B and locks/ untouched', async () => {
    const { server, stop } = inProcMcp(stateRoot);
    let sidA: string;
    let sidB: string;
    try {
      const a = await server._handleToolCall('start_session', {
        projectDir: '/tmp/xs-ac6-a',
        stage: 'dev',
      });
      sidA = (JSON.parse(a.content[0]!.text) as { sessionId: string }).sessionId;
      const pidA = findDaemonPid(stateRoot, sidA);
      if (pidA !== null) spawnedPids.push(pidA);

      const b = await server._handleToolCall('start_session', {
        projectDir: '/tmp/xs-ac6-b',
        stage: 'dev',
      });
      sidB = (JSON.parse(b.content[0]!.text) as { sessionId: string }).sessionId;
      const pidB = findDaemonPid(stateRoot, sidB);
      if (pidB !== null) spawnedPids.push(pidB);

      expect(sidA).not.toBe(sidB);
      const sessionsDir = path.join(stateRoot, 'sessions');
      const locksDir = path.join(stateRoot, 'locks');
      expect(fs.existsSync(path.join(sessionsDir, sidA))).toBe(true);
      expect(fs.existsSync(path.join(sessionsDir, sidB))).toBe(true);
      expect(fs.existsSync(locksDir)).toBe(true);

      // Stop only A.
      await server._handleToolCall('stop_session', { sessionId: sidA });

      // A is gone; B and locks/ remain.
      expect(fs.existsSync(path.join(sessionsDir, sidA))).toBe(false);
      expect(fs.existsSync(path.join(sessionsDir, sidB))).toBe(true);
      expect(fs.existsSync(locksDir)).toBe(true);
    } finally {
      await stop();
    }
  }, 30_000);
});
