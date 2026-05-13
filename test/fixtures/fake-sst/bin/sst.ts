/**
 * Fake `sst dev` — minimal contract emulator for the e2e fixture.
 *
 * Emits the subset of behaviour our consumers parse:
 *   - `<cwd>/.sst/<stage>.server` URL discovery file (ServerFileWatcher)
 *   - HTTP `/stream` concatenated-JSON SSE bus (HttpEventStream + SstBusEvent)
 *   - HTTP `POST /rpc` always-200 liveness probe
 *   - Per-pane log files at `<cwd>/.sst/log/<paneName>.log` (PaneLogWatcher,
 *     mtime-driven)
 *   - PTY keystroke handling: `j`/`k`/arrows navigate, `\r` start, `x` stop
 *     — mirrors the comparator in `pane-navigator.ts:83-91` over the panes
 *     this fake declares.
 *
 * The fake does NOT spawn child processes, exec any AWS calls, or honour
 * any flags besides `dev --stage <stage>`. Behaviour is fully hardcoded.
 *
 * Drift watching (re-check on SST version bump or src/ refactor):
 *   - src/core/infra/discovery/server-file-watcher.ts (URL file format)
 *   - src/core/infra/pane-log/pane-log-watcher.ts (log path + mtime rules)
 *   - src/core/infra/stream/sst-bus-event.ts (event shapes)
 *   - src/core/infra/config/sst-config-parser.ts (Task- prefix → kind:task)
 *   - src/core/domain/pane/pane-navigator.ts:58-94 (sort + nav protocol)
 *   - src/core/common/keystroke/keystroke-encoder.ts (KEY constants)
 */
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PaneState {
  name: string;
  killable: boolean;
  isSystem: boolean;
  alive: boolean;
}

// ---------------------------------------------------------------------------
// Argv parse — accept any `dev --stage <stage>` form, ignore other flags.
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv[0] !== 'dev') {
  // Non-dev passthrough — e.g. `sst version`. Just print a stub and exit 0.
  // run_sst always invokes the binary with its own args; we don't have to
  // be feature-perfect, only deterministic.
  process.stdout.write(`fake-sst-fixture v0.0.0 (args: ${argv.join(' ')})\n`);
  process.exit(0);
}

let stage = 'default';
for (let i = 1; i < argv.length; i++) {
  if (argv[i] === '--stage' && argv[i + 1] !== undefined) {
    stage = argv[i + 1]!;
    i++;
  }
}

const cwd = process.cwd();
const sstDir = path.join(cwd, '.sst');
const logDir = path.join(sstDir, 'log');
fs.mkdirSync(logDir, { recursive: true });

// ---------------------------------------------------------------------------
// Pane registry — fixed roster. Mirrors sst.config.ts.
// ---------------------------------------------------------------------------
const PANES: PaneState[] = [
  { name: 'SST', killable: false, isSystem: true, alive: true },
  { name: 'Functions', killable: false, isSystem: true, alive: true },
  { name: 'backend', killable: true, isSystem: false, alive: true },
  { name: 'fe', killable: true, isSystem: false, alive: true },
  { name: 'worker', killable: true, isSystem: false, alive: true },
  { name: 'Task-migrate', killable: true, isSystem: false, alive: true },
  // Task-seed has autostart:false → starts as not-alive.
  { name: 'Task-seed', killable: true, isSystem: false, alive: false },
];

/**
 * Local mirror of `PaneNavigator._localSortOrder` (src/core/domain/pane/
 * pane-navigator.ts:83-91). Sort key (ascending): killable false first,
 * alive true first, then name length.
 *
 * NOTE: `_localSortOrder` is `private` in pane-navigator.ts and the
 * comparator isn't exported. We duplicate it here as a documented risk —
 * the alternative (exporting it from src/) violates the "no src/ changes"
 * scope guardrail of this fixture. See `.omc/plans/e2e-fixture-v2.md` §8
 * follow-ups for the long-term resolution.
 */
function sortedOrder(): readonly PaneState[] {
  return [...PANES].sort((a, b) => {
    if (a.killable !== b.killable) return a.killable ? 1 : -1;
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return a.name.length - b.name.length;
  });
}

function paneByName(name: string): PaneState | undefined {
  return PANES.find((p) => p.name === name);
}

// ---------------------------------------------------------------------------
// Log helpers.
// ---------------------------------------------------------------------------
function logFile(name: string): string {
  return path.join(logDir, `${name}.log`);
}

function appendLine(name: string, line: string): void {
  const file = logFile(name);
  fs.appendFileSync(file, line.endsWith('\n') ? line : line + '\n');
  // Force strict mtime advance — on fast filesystems consecutive writes can
  // share the same mtime, which would prevent `pane-log-watcher.ts` from
  // detecting restart (it gates on `mtime > stoppedMtimeMs`).
  const now = Date.now() / 1000;
  fs.utimesSync(file, now, now + 0.025);
}

function ensureEmptyLog(name: string): void {
  const file = logFile(name);
  // Create empty file with mtime baseline so `pane-log-watcher.ts` captures
  // a non-zero baseline; the next write (mtime advance) flips absent→started.
  fs.writeFileSync(file, '');
  // Pin mtime in the past so the first appendLine() comfortably advances it.
  const past = (Date.now() - 1000) / 1000;
  fs.utimesSync(file, past, past);
}

// Initialise log files for autostart panes only (Task-seed stays absent
// until the daemon issues `start_command(Task-seed)`).
for (const p of PANES) {
  if (p.isSystem) continue;
  if (p.alive) ensureEmptyLog(p.name);
}

// ---------------------------------------------------------------------------
// HTTP server — /stream (SSE-ish concatenated JSON) and /rpc (200 OK).
// ---------------------------------------------------------------------------
const streamClients = new Set<http.ServerResponse>();
// Real SST's `/stream` replays the most recent StackCommandEvent and
// CompleteEvent on connect (see sst-session.ts:670). The daemon relies on
// this to learn the deploy state regardless of when it connects.
let lastStackCommandEvent: unknown = null;
let lastCompleteEvent: unknown = null;

function writeTo(res: http.ServerResponse, event: unknown): boolean {
  try {
    return res.write(JSON.stringify(event) + '\n');
  } catch {
    return false;
  }
}

function broadcast(event: unknown): void {
  for (const res of streamClients) writeTo(res, event);
}

function emitStackCommandEvent(payload: unknown): void {
  lastStackCommandEvent = payload;
  broadcast(payload);
}

function emitCompleteEvent(payload: unknown): void {
  lastCompleteEvent = payload;
  broadcast(payload);
}

const server = http.createServer((req, res) => {
  if (req.url === '/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    });
    streamClients.add(res);
    // Replay the latest events so a late-connecting consumer doesn't have
    // to wait for the next 20s redeploy cycle.
    if (lastStackCommandEvent !== null) writeTo(res, lastStackCommandEvent);
    if (lastCompleteEvent !== null) writeTo(res, lastCompleteEvent);
    req.on('close', () => streamClients.delete(res));
    return;
  }
  if (req.url === '/rpc' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  if (addr === null || typeof addr === 'string') {
    process.stderr.write('fake-sst: server.address() unexpectedly null\n');
    process.exit(1);
  }
  const url = `http://127.0.0.1:${addr.port}`;

  // Write the URL discovery file ONLY after listen resolves so the watcher's
  // POST /rpc liveness probe succeeds on the first read.
  const serverFile = path.join(sstDir, `${stage}.server`);
  fs.writeFileSync(serverFile, url + '\n');

  // ---- Deploy timeline ---------------------------------------------------
  // t=0 baseline: emit StackCommandEvent + DeployRequestedEvent. These are
  // also remembered as last-events so a late-connecting client gets them
  // immediately on connect.
  emitStackCommandEvent({
    type: 'project.StackCommandEvent',
    event: {
      App: 'fake-sst-fixture',
      Stage: stage,
      Config: 'sst.config.ts',
      Command: 'dev',
      Version: '3.0.0-fake',
    },
  });
  broadcast({ type: 'deployer.DeployRequestedEvent', event: {} });

  // t=300ms: first CompleteEvent + initial log lines for autostart panes.
  // Devs:{}/Tasks:{}/Tunnels:{} keeps parser-driven kinds (Task- prefix →
  // task) and prevents Tasks/Tunnels system panes from joining the
  // navigator's sort order (B4 in the plan).
  setTimeout(() => {
    appendLine('backend', 'starting backend on :3000');
    appendLine('fe', 'starting fe on :3001');
    appendLine('worker', 'starting worker');
    appendLine('Task-migrate', 'applied 0001_init');

    emitCompleteEvent({
      type: 'project.CompleteEvent',
      event: {
        UpdateID: 'fake-update-001',
        Errors: [],
        Finished: true,
        Old: false,
        Devs: {},
        Tasks: {},
        Tunnels: {},
      },
    });
  }, 300);

  // 20s redeploy cycle — drives `wait_for_next_ready`. Each cycle must emit
  // StackCommandEvent (Command=deploy) to flip the session state machine
  // READY → BUSY, then CompleteEvent to flip BUSY → READY. See
  // `sst-session.ts:658-678`.
  let updateSeq = 2;
  const redeployTimer = setInterval(() => {
    emitStackCommandEvent({
      type: 'project.StackCommandEvent',
      event: {
        App: 'fake-sst-fixture',
        Stage: stage,
        Config: 'sst.config.ts',
        Command: 'deploy',
        Version: '3.0.0-fake',
      },
    });
    broadcast({ type: 'deployer.DeployRequestedEvent', event: {} });
    setTimeout(() => {
      // Heartbeat append so PaneLogWatcher sees ongoing activity on live
      // panes (not strictly required, but keeps the test diagnostics rich).
      try {
        if (paneByName('backend')?.alive) appendLine('backend', `[heartbeat ${updateSeq}]`);
      } catch {
        /* log might be missing if pane was stopped — ignore */
      }
      broadcast({
        type: 'project.CompleteEvent',
        event: {
          UpdateID: `fake-update-${String(updateSeq).padStart(3, '0')}`,
          Errors: [],
          Finished: true,
          Old: false,
          Devs: {},
          Tasks: {},
          Tunnels: {},
        },
      });
      updateSeq += 1;
    }, 100);
  }, 20_000);
  redeployTimer.unref();
});

// ---------------------------------------------------------------------------
// PTY keystroke handling — required for `start_command` / `stop_command` /
// `restart_command`. `pane-navigator.ts:navigateTo` sends `K` keys until the
// cursor is at the top, then `J` keys to reach the target index, then the
// action key (`\r` / `x`).
//
// stdin MUST be in raw mode + resumed; otherwise data arrives line-buffered
// or not at all (B5 in the plan).
// ---------------------------------------------------------------------------
// Stdin in raw mode is mandatory — node-pty's slave delivers bytes
// without it, but they're line-buffered. Even when isTTY is false (e.g.
// piped under shells that don't allocate a PTY), we still resume the
// stream so .on('data') fires.
if (process.stdin.isTTY) {
  try {
    process.stdin.setRawMode(true);
  } catch {
    /* harmless */
  }
}
process.stdin.resume();
let cursor = 0;
let pendingEscape = ''; // For multi-byte arrow sequences (\x1b[A/B/C/D).

function selectedPane(): PaneState | undefined {
  const order = sortedOrder();
  return order[cursor];
}

function handleKey(key: string): void {
  // Arrows are 3 bytes: \x1b [ <A|B|C|D>. Accumulate.
  if (pendingEscape.length > 0) {
    pendingEscape += key;
    if (pendingEscape.length === 3) {
      const tail = pendingEscape[2];
      pendingEscape = '';
      if (tail === 'A' || tail === 'D') {
        cursor = Math.max(0, cursor - 1);
      } else if (tail === 'B' || tail === 'C') {
        cursor = Math.min(sortedOrder().length - 1, cursor + 1);
      }
    }
    return;
  }

  if (key === '\x1b') {
    pendingEscape = '\x1b';
    return;
  }

  if (key === 'j') {
    cursor = Math.min(sortedOrder().length - 1, cursor + 1);
    return;
  }
  if (key === 'k') {
    cursor = Math.max(0, cursor - 1);
    return;
  }
  if (key === '\r') {
    const sel = selectedPane();
    if (!sel || sel.isSystem || !sel.killable) return;
    // Re-run currently selected pane: if it was stopped/idle, write
    // restart marker + new start line; if it was running, this is a no-op
    // from a real SST POV (Enter on a running pane is the toggle pane —
    // but our daemon's startCommand pre-checks status before issuing).
    if (!sel.alive) {
      // appendFileSync creates the file if it doesn't exist (first-run case
      // for Task-seed). The subsequent utimesSync inside appendLine forces
      // mtime above the watcher's baseline so absent→started fires on the
      // next pane-log-watcher tick.
      //
      // CRITICAL: defer the write past PaneNavigator's settleMs (~100ms).
      // SSTSession.startCommand does:
      //   await sendKey(Enter)          // 100ms settleMs sleep
      //   applyStatus(STARTING)         // optimistic
      //   await waitForAnyStatus([RUNNING, STOPPED, ERRORED], 60s)
      // If we write the log file before applyStatus(STARTING) runs,
      // pane-log-watcher may fire RUNNING (status: idle → running) BEFORE
      // the optimistic STARTING write, and then STARTING overwrites
      // RUNNING. The waiter (registered after that) then never sees a
      // transition into a target status and hangs for the full 60s.
      // 200ms > 100ms settleMs is enough headroom.
      const name = sel.name;
      sel.alive = true;
      setTimeout(() => {
        try {
          appendLine(name, '--- restarted ---');
          appendLine(name, `starting ${name}`);
        } catch {
          /* ignore */
        }
      }, 200).unref();
    }
    return;
  }
  if (key === 'x') {
    const sel = selectedPane();
    if (!sel || sel.isSystem || !sel.killable) return;
    if (sel.alive) {
      appendLine(sel.name, '--- stopped ---');
      sel.alive = false;
      // Reset cursor to a safe slot — sort order will shift the just-stopped
      // pane down. Re-pinning cursor to 0 mirrors how real SST drops focus.
      cursor = 0;
    }
    return;
  }
  // Other keys (f, Ctrl-Z, Ctrl-L, etc.) are ignored — the daemon never
  // sends them through public commands.
}

process.stdin.on('data', (chunk: Buffer) => {
  const str = chunk.toString('utf8');
  for (const ch of str) {
    handleKey(ch);
  }
});

// ---------------------------------------------------------------------------
// Shutdown.
// ---------------------------------------------------------------------------
function shutdown(): void {
  try {
    for (const res of streamClients) res.end();
    streamClients.clear();
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
  // Force exit if close hangs (rare but defensive).
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
