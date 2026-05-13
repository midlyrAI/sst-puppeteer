import * as fs from 'node:fs';
import { NodePtyAdapter, SessionBuilder, type Pty, type SSTSession } from '../core/index.js';
import { IpcServer } from './ipc-server.js';
import { readMeta, writeMeta } from './meta.js';
import { metaPath, socketPath as socketPathFn } from './paths.js';

export type AdapterFactory = () => Pty;

export interface RunDaemonCtx {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

/**
 * Daemon entry point. Called from both bins (`cli/bin/sst-puppeteer.ts` and
 * `mcp/bin/sst-puppeteer-mcp.ts`) when invoked with `__daemon <sessionId>`.
 *
 * Reads meta.json, builds an SSTSession, starts the IPC server, then drives
 * `session.start()` in the background so the daemon's "ready" handshake can
 * fire long before the SST deploy completes. Never returns — exits via
 * `process.exit` when the session shuts down.
 */
export const runDaemon = async (
  sessionId: string,
  ctx: RunDaemonCtx,
  adapterFactory: AdapterFactory = () => new NodePtyAdapter(),
): Promise<void> => {
  if (sessionId === '') {
    ctx.stderr.write(JSON.stringify({ error: '__daemon requires sessionId arg' }) + '\n');
    process.exit(1);
  }
  const sessionDirEnv = process.env['SST_PUPPETEER_SESSION_DIR'];
  if (sessionDirEnv === undefined || sessionDirEnv === '') {
    ctx.stderr.write(JSON.stringify({ error: 'SST_PUPPETEER_SESSION_DIR not set' }) + '\n');
    process.exit(1);
  }
  const mp = metaPath(sessionId);
  if (!fs.existsSync(mp)) {
    ctx.stderr.write(JSON.stringify({ error: `meta.json not found at ${mp}` }) + '\n');
    process.exit(1);
  }

  const meta = readMeta(sessionId);
  if (meta.sessionId !== sessionId) {
    ctx.stderr.write(
      JSON.stringify({
        error: `sessionId mismatch: arg=${sessionId} meta=${meta.sessionId}`,
      }) + '\n',
    );
    process.exit(1);
  }

  const session: SSTSession = new SessionBuilder({
    projectDir: meta.projectDir,
    stage: meta.stage,
    awsProfile: meta.awsProfile,
    awsRegion: meta.awsRegion,
    adapter: adapterFactory(),
  }).build();

  // Start the IPC server BEFORE awaiting session.start(). The daemon's
  // "ready" handshake means "IPC listening, you can call wait_for_ready",
  // NOT "SST deploy complete" — those can be many minutes apart. Driving
  // session.start() in the background lets short CLI invocations like
  // `start --no-wait` return immediately while the deploy proceeds.
  const sockPath = socketPathFn(sessionId);
  const server = new IpcServer(session, sockPath);
  await server.start();

  let exiting = false;
  const finish = async (code: number): Promise<void> => {
    if (exiting) return;
    exiting = true;
    try {
      await server.stop();
    } catch {
      // ignore
    }
    try {
      await session.stop();
    } catch {
      // ignore
    }
    try {
      writeMeta(sessionId, { ...readMeta(sessionId), status: 'stopped' });
    } catch {
      // ignore
    }
    process.exit(code);
  };

  server.on('shutdown', () => {
    void finish(0);
  });

  process.on('SIGTERM', () => void finish(0));
  process.on('SIGINT', () => void finish(0));

  // Drive session.start() in the background so the daemon's "ready" can fire
  // before SST's deploy completes. On failure, persist status:'failed' to
  // meta so callers (list_sessions, the next startOrAttach) can see it.
  void session.start().catch((err: unknown) => {
    const e = err instanceof Error ? err : new Error(String(err));
    try {
      writeMeta(sessionId, {
        ...readMeta(sessionId),
        status: 'failed',
        failureReason: e.message,
        lastUpdatedAt: Date.now(),
      });
    } catch {
      // meta write failed; nothing to do
    }
    ctx.stderr.write(
      JSON.stringify({
        error: 'session.start() failed',
        message: e.message,
        stack: e.stack,
      }) + '\n',
    );
    // Skip the SIGTERM/finish(0) status:'stopped' overwrite — keep failed.
    void (async (): Promise<void> => {
      if (exiting) return;
      exiting = true;
      try {
        await server.stop();
      } catch {
        // ignore
      }
      try {
        await session.stop();
      } catch {
        // ignore
      }
      process.exit(1);
    })();
  });
  process.on('disconnect', () => {
    // no-op: parent detached intentionally
  });

  if (typeof process.send === 'function') {
    if (process.connected) {
      process.send({ type: 'ready', socketPath: sockPath });
    }
    process.channel?.unref?.();
  }

  // Block forever — server keeps the event loop alive.
  await new Promise<void>(() => {
    // never resolves
  });
};
