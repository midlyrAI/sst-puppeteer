/**
 * Test-only fake daemon. Spawned (detached) by `fakeSpawnDaemon` in
 * cross-surface integration tests. Mimics the real daemon protocol just
 * enough for AC-1..AC-6:
 *
 *   - Reads SST_PUPPETEER_SESSION_DIR + sessionId from argv[2].
 *   - Reads meta.json from disk to get socketPath.
 *   - Opens a Unix-domain socket at socketPath.
 *   - Sends `{type:'ready', socketPath}` via process.send if IPC channel exists.
 *   - Speaks line-delimited JSON-RPC matching the IpcMethod enum.
 *   - On SIGTERM/SIGINT, closes the server cleanly.
 *
 * Wire methods stubbed:
 *   wait_for_ready, wait_for_next_ready -> {ready:true, state:'ready'}
 *   list_commands -> {commands:[]}
 *   get_command_status -> {state:'stopped'}
 *   start_command/stop_command/restart_command -> {started/stopped/restarted:true}
 *   read_command_logs -> {lines:[]}
 *   stop_session -> emits shutdown response; daemon exits after replying.
 */
import * as fs from 'node:fs';
import * as net from 'node:net';

const sessionId = process.argv[2];
const sessionDir = process.env['SST_PUPPETEER_SESSION_DIR'];

if (sessionId === undefined || sessionId === '') {
  process.stderr.write('fake-daemon: missing sessionId arg\n');
  process.exit(1);
}
if (sessionDir === undefined || sessionDir === '') {
  process.stderr.write('fake-daemon: missing SST_PUPPETEER_SESSION_DIR\n');
  process.exit(1);
}

const metaPath = `${sessionDir}/meta.json`;
let socketPath: string;
try {
  const metaRaw = fs.readFileSync(metaPath, 'utf-8');
  const meta = JSON.parse(metaRaw) as { socketPath: string };
  socketPath = meta.socketPath;
} catch (err) {
  process.stderr.write(`fake-daemon: cannot read meta: ${String(err)}\n`);
  process.exit(1);
}

// Best-effort cleanup of any stale socket file.
try {
  fs.unlinkSync(socketPath);
} catch {
  // ignore
}

let shuttingDown = false;

const handleRequest = (req: { id: string; method: string; params?: unknown }): unknown => {
  switch (req.method) {
    case 'wait_for_ready':
    case 'wait_for_next_ready':
      return { ready: true, state: 'ready', durationMs: 1 };
    case 'list_commands':
      return { commands: [] };
    case 'get_command_status':
      return { state: 'stopped' };
    case 'start_command':
      return { started: true };
    case 'stop_command':
      return { stopped: true };
    case 'restart_command':
      return { restarted: true };
    case 'read_command_logs':
      return { lines: [] };
    case 'stop_session':
      shuttingDown = true;
      return { stopped: true };
    default:
      throw new Error(`unknown method: ${req.method}`);
  }
};

const server = net.createServer((socket) => {
  let buf = '';
  socket.on('data', (chunk) => {
    buf += chunk.toString('utf-8');
    while (true) {
      const nl = buf.indexOf('\n');
      if (nl === -1) break;
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      let req: { id: string; method: string; params?: unknown };
      try {
        req = JSON.parse(line) as { id: string; method: string; params?: unknown };
      } catch {
        continue;
      }
      try {
        const result = handleRequest(req);
        const resp = { id: req.id, ok: true, result };
        socket.write(JSON.stringify(resp) + '\n');
        if (shuttingDown) {
          // After replying to stop_session, exit cleanly.
          setTimeout(() => {
            try {
              server.close();
            } catch {
              /* ignore */
            }
            try {
              fs.unlinkSync(socketPath);
            } catch {
              /* ignore */
            }
            process.exit(0);
          }, 10);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const resp = { id: req.id, ok: false, error: { code: 'INTERNAL', message: msg } };
        socket.write(JSON.stringify(resp) + '\n');
      }
    }
  });
  socket.on('error', () => {
    /* ignore */
  });
});

server.listen(socketPath, () => {
  // Notify parent via IPC channel (fork-mode handshake).
  if (typeof process.send === 'function' && process.connected) {
    try {
      process.send({ type: 'ready', socketPath });
    } catch {
      /* ignore */
    }
    process.channel?.unref?.();
  }
});

const shutdown = (): void => {
  try {
    server.close();
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(socketPath);
  } catch {
    /* ignore */
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Keep the process alive forever (server holds the event loop).
