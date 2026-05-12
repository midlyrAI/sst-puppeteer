import * as fs from 'node:fs';
import {
  NodePtyAdapter,
  SessionBuilder,
  type Pty,
  type SSTSession,
} from '../../core/index.js';
import { IpcServer } from '../daemon/ipc-server.js';
import { readMeta, writeMeta } from '../state/meta.js';
import { metaPath, socketPath as socketPathFn } from '../state/paths.js';
import { Command, type CliContext } from './command.js';

export type AdapterFactory = () => Pty;

export class DaemonEntryCommand extends Command {
  readonly name = '__daemon';
  readonly description = '(internal) daemon entry point';
  override readonly hidden = true;

  constructor(private readonly _adapterFactory: AdapterFactory = () => new NodePtyAdapter()) {
    super();
  }

  override async execute(args: readonly string[], ctx: CliContext): Promise<number> {
    const sessionId = args[0];
    if (sessionId === undefined || sessionId === '') {
      ctx.stderr.write(JSON.stringify({ error: '__daemon requires sessionId arg' }) + '\n');
      return 1;
    }
    const sessionDirEnv = process.env['SST_PUPPETEER_SESSION_DIR'];
    if (sessionDirEnv === undefined || sessionDirEnv === '') {
      ctx.stderr.write(
        JSON.stringify({ error: 'SST_PUPPETEER_SESSION_DIR not set' }) + '\n',
      );
      return 1;
    }
    const mp = metaPath(sessionId);
    if (!fs.existsSync(mp)) {
      ctx.stderr.write(JSON.stringify({ error: `meta.json not found at ${mp}` }) + '\n');
      return 1;
    }

    const meta = readMeta(sessionId);
    if (meta.sessionId !== sessionId) {
      ctx.stderr.write(
        JSON.stringify({
          error: `sessionId mismatch: arg=${sessionId} meta=${meta.sessionId}`,
        }) + '\n',
      );
      return 1;
    }

    const session: SSTSession = new SessionBuilder({
      projectDir: meta.projectDir,
      stage: meta.stage,
      awsProfile: meta.awsProfile,
      awsRegion: meta.awsRegion,
      adapter: this._adapterFactory(),
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
    // before SST's deploy completes. On failure, exit so callers see pid-dead.
    void session.start().catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err));
      ctx.stderr.write(
        JSON.stringify({
          error: 'session.start() failed',
          message: e.message,
          stack: e.stack,
        }) + '\n',
      );
      void finish(1);
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

    // Keep the process alive forever (server keeps event loop alive). Return
    // a never-resolving promise so Command.execute does not finish.
    return new Promise<number>(() => {
      // never resolves
    });
  }
}
