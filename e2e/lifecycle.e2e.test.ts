/**
 * End-to-end lifecycle rotation against the fake-sst fixture.
 *
 * Spec: `.omc/specs/deep-interview-e2e-fixture.md` AC-E1..AC-E11.
 * Plan: `.omc/plans/e2e-fixture-v2.md` §4.
 *
 * Strategy: spawn the built bins (`cli/dist/cli/bin/sst-puppeteer.js`, `mcp/dist/mcp/bin/sst-puppeteer-mcp.js`) as
 * child processes with a hermetic `SST_PUPPETEER_STATE_ROOT` tmpdir. Each
 * AC is its own `it(...)` block; ordering is `describe.sequential` so
 * state set up in one block (sessionId, etc.) flows through module-scoped
 * variables. Two halves — CLI and MCP — each run their own session
 * lifecycle but share the state root.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { runCli, parseJsonStdout, type CliResult } from './helpers/cli-dist.js';
import { McpDistChild } from './helpers/mcp-dist-child.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const cliEntry = path.join(repoRoot, 'cli', 'dist', 'cli', 'bin', 'sst-puppeteer.js');
const mcpEntry = path.join(repoRoot, 'mcp', 'dist', 'mcp', 'bin', 'sst-puppeteer-mcp.js');
const fixtureDir = path.join(repoRoot, 'e2e', 'fixtures', 'fake-sst');
const fixtureBinDir = path.join(fixtureDir, 'node_modules', '.bin');

const STAGE = 'e2e';

interface ListCommandsOut {
  commands: Array<{ spec: { name: string }; status: string }>;
}
interface StartSessionOut {
  sessionId: string;
  status: 'ready' | 'started' | 'failed';
}
interface StatusOut {
  status: string;
}
interface LogsOut {
  lines: string[];
}
interface SessionsListOut {
  sessions: Array<{ sessionId: string; state?: string }>;
}
interface RunSstOut {
  exitCode: number | null;
  stdout: string;
}

function mkStateRoot(): string {
  // macOS sun_path is 104 bytes and the per-session socket path is
  //   <root>/sessions/<uuid>/daemon.sock
  // — 53 bytes after the root. Using `os.tmpdir()` (e.g.
  // `/var/folders/.../T/`) blows the limit on macOS. `/tmp/sstp-e2e-XXX`
  // mirrors what `test/integration/cross-surface.test.ts` does.
  return fs.mkdtempSync('/tmp/sstp-e2e-');
}

function cleanupStateRoot(stateRoot: string): void {
  try {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function defensiveKillFakes(): void {
  // Best-effort sweep — the fake's process name surfaces in `ps` via its
  // package name. Low collision risk.
  try {
    execSync("pkill -f 'fake-sst/bin/sst.ts' || true", { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}

function cleanFixtureRuntimeState(): void {
  // The fake writes `.sst/<stage>.server` and `.sst/log/*.log` under the
  // fixture dir. If a prior half didn't fully tear down (e.g. fast vitest
  // shutdown), the stale URL file would point ServerFileWatcher at a dead
  // port and the daemon's HttpEventStream would exhaust its reconnect
  // budget. Wipe before each half starts.
  try {
    fs.rmSync(path.join(fixtureDir, '.sst'), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Run the CLI with PATH augmented to include the fixture's
 * `node_modules/.bin`. Needed for `run-sst` which spawns `sst` directly
 * (no `collectNodeModulesBins` walk — that's only done by the daemon).
 */
async function cli(args: readonly string[], stateRoot: string): Promise<CliResult> {
  const augmentedPath = `${fixtureBinDir}${path.delimiter}${process.env['PATH'] ?? ''}`;
  return runCli(
    cliEntry,
    args,
    { SST_PUPPETEER_STATE_ROOT: stateRoot, PATH: augmentedPath },
    { timeoutMs: 45_000 },
  );
}

function expectOk(res: CliResult, label: string): void {
  expect(res.code, `${label} stderr=${res.stderr}\nstdout=${res.stdout}`).toBe(0);
}

describe.sequential('e2e lifecycle — CLI half', () => {
  let stateRoot: string;
  let sessionId: string;

  beforeAll(() => {
    defensiveKillFakes();
    cleanFixtureRuntimeState();
    stateRoot = mkStateRoot();
  });

  afterAll(async () => {
    // Idempotent stop (in case a test failed mid-flight).
    if (sessionId !== undefined) {
      await cli(['stop', '--session', sessionId], stateRoot).catch(() => undefined);
    }
    defensiveKillFakes();
    cleanupStateRoot(stateRoot);
    cleanFixtureRuntimeState();
  });

  it('AC-E1 boot: start <fixture> --stage e2e returns ready', async () => {
    const res = await cli(['start', fixtureDir, '--stage', STAGE], stateRoot);
    expectOk(res, 'start');
    const out = parseJsonStdout<StartSessionOut>(res);
    expect(out.status).toBe('ready');
    expect(typeof out.sessionId).toBe('string');
    sessionId = out.sessionId;
  });

  it('AC-E4 list-commands: 5 panes + initial statuses', async () => {
    const res = await cli(['list-commands', '--session', sessionId], stateRoot);
    expectOk(res, 'list-commands');
    const out = parseJsonStdout<ListCommandsOut>(res);
    const byName = new Map(out.commands.map((c) => [c.spec.name, c]));
    expect([...byName.keys()].sort()).toEqual(
      ['Task-migrate', 'Task-seed', 'backend', 'fe', 'worker'].sort(),
    );
    expect(byName.get('backend')!.status).toBe('running');
    expect(byName.get('fe')!.status).toBe('running');
    expect(byName.get('worker')!.status).toBe('running');
    expect(byName.get('Task-migrate')!.status).toBe('running');
    expect(byName.get('Task-seed')!.status).toBe('idle');
  });

  it('AC-E3 get-command-status Task-migrate → running', async () => {
    const res = await cli(
      ['get-command-status', '--session', sessionId, '--command-name', 'Task-migrate'],
      stateRoot,
    );
    expectOk(res, 'get-command-status migrate');
    expect(parseJsonStdout<StatusOut>(res).status).toBe('running');
  });

  it('AC-E3 get-command-status Task-seed → idle', async () => {
    const res = await cli(
      ['get-command-status', '--session', sessionId, '--command-name', 'Task-seed'],
      stateRoot,
    );
    expectOk(res, 'get-command-status seed');
    expect(parseJsonStdout<StatusOut>(res).status).toBe('idle');
  });

  it('AC-E3 read-command-logs backend returns non-empty', async () => {
    const res = await cli(
      ['read-command-logs', '--session', sessionId, '--command-name', 'backend'],
      stateRoot,
    );
    expectOk(res, 'read-command-logs backend');
    expect(parseJsonStdout<LogsOut>(res).lines.length).toBeGreaterThan(0);
  });

  it('AC-E5 start-command Task-seed: idle → running; log non-empty', async () => {
    const start = await cli(
      ['start-command', '--session', sessionId, '--command-name', 'Task-seed'],
      stateRoot,
    );
    expectOk(start, 'start-command Task-seed');
    const status = await cli(
      ['get-command-status', '--session', sessionId, '--command-name', 'Task-seed'],
      stateRoot,
    );
    expectOk(status, 'status Task-seed');
    expect(parseJsonStdout<StatusOut>(status).status).toBe('running');
    const logs = await cli(
      ['read-command-logs', '--session', sessionId, '--command-name', 'Task-seed'],
      stateRoot,
    );
    expectOk(logs, 'logs Task-seed');
    expect(parseJsonStdout<LogsOut>(logs).lines.length).toBeGreaterThan(0);
  });

  it('AC-E6 stop-command + start-command Task-migrate cycles status', async () => {
    const stop = await cli(
      ['stop-command', '--session', sessionId, '--command-name', 'Task-migrate'],
      stateRoot,
    );
    expectOk(stop, 'stop-command Task-migrate');
    const stoppedStatus = await cli(
      ['get-command-status', '--session', sessionId, '--command-name', 'Task-migrate'],
      stateRoot,
    );
    expect(parseJsonStdout<StatusOut>(stoppedStatus).status).toBe('stopped');

    const start = await cli(
      ['start-command', '--session', sessionId, '--command-name', 'Task-migrate'],
      stateRoot,
    );
    expectOk(start, 'start-command Task-migrate');
    const runningStatus = await cli(
      ['get-command-status', '--session', sessionId, '--command-name', 'Task-migrate'],
      stateRoot,
    );
    expect(parseJsonStdout<StatusOut>(runningStatus).status).toBe('running');
  });

  it('AC-E7 restart-command backend: running, log has --- restarted ---', async () => {
    const restart = await cli(
      ['restart-command', '--session', sessionId, '--command-name', 'backend'],
      stateRoot,
    );
    expectOk(restart, 'restart-command backend');
    const status = await cli(
      ['get-command-status', '--session', sessionId, '--command-name', 'backend'],
      stateRoot,
    );
    expect(parseJsonStdout<StatusOut>(status).status).toBe('running');
    const logs = await cli(
      ['read-command-logs', '--session', sessionId, '--command-name', 'backend'],
      stateRoot,
    );
    const lines = parseJsonStdout<LogsOut>(logs).lines;
    expect(lines.some((l) => l.includes('--- restarted ---'))).toBe(true);
  });

  it('AC-E8 stop+start worker', async () => {
    const stop = await cli(
      ['stop-command', '--session', sessionId, '--command-name', 'worker'],
      stateRoot,
    );
    expectOk(stop, 'stop-command worker');
    const start = await cli(
      ['start-command', '--session', sessionId, '--command-name', 'worker'],
      stateRoot,
    );
    expectOk(start, 'start-command worker');
    const status = await cli(
      ['get-command-status', '--session', sessionId, '--command-name', 'worker'],
      stateRoot,
    );
    expect(parseJsonStdout<StatusOut>(status).status).toBe('running');
  });

  it('AC-E3 wait-for-ready returns fast (already ready)', async () => {
    const res = await cli(
      ['wait-for-ready', '--session', sessionId, '--timeout', '5000'],
      stateRoot,
    );
    expectOk(res, 'wait-for-ready');
  });

  it('AC-E9 wait-for-next-ready catches 20s redeploy', { timeout: 30_000 }, async () => {
    const res = await cli(
      ['wait-for-next-ready', '--session', sessionId, '--timeout', '25000'],
      stateRoot,
    );
    expectOk(res, 'wait-for-next-ready');
  });

  it('AC-E3 run-sst --version exits 0', async () => {
    const res = await cli(['run-sst', '--project', fixtureDir, '--', '--version'], stateRoot);
    expectOk(res, 'run-sst --version');
    const out = parseJsonStdout<RunSstOut>(res);
    expect(out.exitCode).toBe(0);
  });

  it('AC-E3 list shows session', async () => {
    const res = await cli(['list'], stateRoot);
    expectOk(res, 'list');
    const out = parseJsonStdout<SessionsListOut>(res);
    expect(out.sessions.find((s) => s.sessionId === sessionId)).toBeDefined();
  });

  it('AC-E10 stop session removes only own subdir', async () => {
    const sessionsDir = path.join(stateRoot, 'sessions');
    const sidDir = path.join(sessionsDir, sessionId);
    expect(fs.existsSync(sidDir)).toBe(true);

    const stop = await cli(['stop', '--session', sessionId], stateRoot);
    expectOk(stop, 'stop');

    expect(fs.existsSync(sidDir)).toBe(false);
    // locks/ or other sibling state under stateRoot still present.
    expect(fs.existsSync(stateRoot)).toBe(true);

    const list = await cli(['list'], stateRoot);
    expectOk(list, 'list-empty');
    const out = parseJsonStdout<SessionsListOut>(list);
    expect(out.sessions.find((s) => s.sessionId === sessionId)).toBeUndefined();
  });
});

describe.sequential('e2e lifecycle — MCP half', () => {
  let stateRoot: string;
  let mcp: McpDistChild;
  let sessionId: string;

  beforeAll(async () => {
    defensiveKillFakes();
    cleanFixtureRuntimeState();
    stateRoot = mkStateRoot();
    const augmentedPath = `${fixtureBinDir}${path.delimiter}${process.env['PATH'] ?? ''}`;
    mcp = await McpDistChild.start({
      mcpEntry,
      env: { SST_PUPPETEER_STATE_ROOT: stateRoot, PATH: augmentedPath },
    });
  });

  afterAll(async () => {
    if (sessionId !== undefined) {
      await mcp.callTool('stop_session', { sessionId }).catch(() => undefined);
    }
    await mcp.kill();
    defensiveKillFakes();
    cleanupStateRoot(stateRoot);
    cleanFixtureRuntimeState();
  });

  it('AC-E2/E11 start_session boots (MCP half)', async () => {
    const res = await mcp.callTool('start_session', { projectDir: fixtureDir, stage: STAGE });
    const payload = McpDistChild.parsePayload<StartSessionOut>(res);
    expect(payload.status).toBe('ready');
    expect(typeof payload.sessionId).toBe('string');
    sessionId = payload.sessionId;
  });

  it('AC-E2 list_sessions shows session', async () => {
    const res = await mcp.callTool('list_sessions', {});
    const payload = McpDistChild.parsePayload<SessionsListOut>(res);
    expect(payload.sessions.find((s) => s.sessionId === sessionId)).toBeDefined();
  });

  it('AC-E2 list_commands returns 5 panes', async () => {
    const res = await mcp.callTool('list_commands', { sessionId });
    const payload = McpDistChild.parsePayload<ListCommandsOut>(res);
    expect(payload.commands.length).toBe(5);
    const byName = new Map(payload.commands.map((c) => [c.spec.name, c]));
    expect(byName.get('Task-migrate')).toBeDefined();
    expect(byName.get('Task-seed')).toBeDefined();
    expect(byName.get('backend')).toBeDefined();
  });

  it('AC-E2 get_command_status Task-seed → idle', async () => {
    const res = await mcp.callTool('get_command_status', { sessionId, commandName: 'Task-seed' });
    expect(McpDistChild.parsePayload<StatusOut>(res).status).toBe('idle');
  });

  it('AC-E2 read_command_logs backend non-empty', async () => {
    const res = await mcp.callTool('read_command_logs', { sessionId, commandName: 'backend' });
    expect(McpDistChild.parsePayload<LogsOut>(res).lines.length).toBeGreaterThan(0);
  });

  it('AC-E2 start_command Task-seed: idle → running', async () => {
    await mcp.callTool('start_command', { sessionId, commandName: 'Task-seed' });
    const status = await mcp.callTool('get_command_status', {
      sessionId,
      commandName: 'Task-seed',
    });
    expect(McpDistChild.parsePayload<StatusOut>(status).status).toBe('running');
  });

  it('AC-E2 stop_command worker → stopped', async () => {
    await mcp.callTool('stop_command', { sessionId, commandName: 'worker' });
    const status = await mcp.callTool('get_command_status', {
      sessionId,
      commandName: 'worker',
    });
    expect(McpDistChild.parsePayload<StatusOut>(status).status).toBe('stopped');
  });

  it('AC-E2 restart_command backend log contains --- restarted ---', async () => {
    await mcp.callTool('restart_command', { sessionId, commandName: 'backend' });
    const logs = await mcp.callTool('read_command_logs', { sessionId, commandName: 'backend' });
    const lines = McpDistChild.parsePayload<LogsOut>(logs).lines;
    expect(lines.some((l) => l.includes('--- restarted ---'))).toBe(true);
  });

  it('AC-E2 wait_for_ready resolves', async () => {
    await mcp.callTool('wait_for_ready', { sessionId, timeoutMs: 5_000 });
  });

  it('AC-E2 wait_for_next_ready catches redeploy', { timeout: 30_000 }, async () => {
    await mcp.callTool('wait_for_next_ready', { sessionId, timeoutMs: 25_000 });
  });

  it('AC-E2 run_sst exits 0', async () => {
    const res = await mcp.callTool('run_sst', {
      projectDir: fixtureDir,
      args: ['--version'],
    });
    const out = McpDistChild.parsePayload<RunSstOut>(res);
    expect(out.exitCode).toBe(0);
  });

  it('AC-E2 stop_session removes session subdir', async () => {
    const sidDir = path.join(stateRoot, 'sessions', sessionId);
    expect(fs.existsSync(sidDir)).toBe(true);
    await mcp.callTool('stop_session', { sessionId });
    expect(fs.existsSync(sidDir)).toBe(false);
    const list = await mcp.callTool('list_sessions', {});
    const payload = McpDistChild.parsePayload<SessionsListOut>(list);
    expect(payload.sessions.find((s) => s.sessionId === sessionId)).toBeUndefined();
    // Mark cleanup done.
    sessionId = undefined as unknown as string;
  });
});
