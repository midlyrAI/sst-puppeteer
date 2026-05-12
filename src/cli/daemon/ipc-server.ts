import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import { type SSTSession } from '../../core/index.js';
import { sessionDir as sessionDirFn, metaPath as metaPathFn } from '../state/paths.js';
import { writeMeta, readMeta } from '../state/meta.js';
import {
  IpcRequestSchema,
  type IpcResponse,
  daemonParamsSchemaFor,
  mapErrorToWire,
} from './protocol.js';

export interface IpcServerEvents {
  shutdown: [];
}

export class IpcServer extends EventEmitter {
  private _server: net.Server | null = null;
  private readonly _inflight = new Set<AbortController>();
  private _shuttingDown = false;

  constructor(
    private readonly _session: SSTSession,
    private readonly _socketPath: string,
  ) {
    super();
  }

  async start(): Promise<void> {
    try {
      fs.unlinkSync(this._socketPath);
    } catch {
      // ignore — file may not exist
    }
    const server = net.createServer((socket) => {
      this._handleConnection(socket).catch(() => {
        // already logged inside handler
      });
    });
    this._server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this._socketPath, () => {
        server.off('error', reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this._shuttingDown = true;
    for (const ac of this._inflight) {
      ac.abort(new Error('SHUTTING_DOWN'));
    }
    this._inflight.clear();
    const server = this._server;
    if (server === null) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    this._server = null;
    try {
      fs.unlinkSync(this._socketPath);
    } catch {
      // ignore
    }
  }

  private async _handleConnection(socket: net.Socket): Promise<void> {
    let buf = '';
    const ac = new AbortController();
    this._inflight.add(ac);

    let disconnected = false;
    socket.on('close', () => {
      disconnected = true;
      ac.abort(new Error('DISCONNECTED'));
    });
    socket.on('error', () => {
      disconnected = true;
      ac.abort(new Error('DISCONNECTED'));
    });

    let request: { id: string; method: string; params: Record<string, unknown> } | null = null;
    try {
      // Read one line.
      const line = await new Promise<string>((resolve, reject) => {
        const onData = (chunk: Buffer): void => {
          buf += chunk.toString('utf-8');
          const nl = buf.indexOf('\n');
          if (nl !== -1) {
            socket.off('data', onData);
            resolve(buf.slice(0, nl));
          }
        };
        const onEnd = (): void => reject(new Error('client closed before request'));
        socket.on('data', onData);
        socket.once('end', onEnd);
        socket.once('error', reject);
      });

      const parsedRaw: unknown = JSON.parse(line);
      request = IpcRequestSchema.parse(parsedRaw);
      const id = request.id;

      if (this._shuttingDown) {
        this._writeResponse(socket, {
          id,
          ok: false,
          error: { code: 'SHUTTING_DOWN', message: 'daemon is shutting down' },
        });
        socket.end();
        return;
      }

      const paramsSchema = daemonParamsSchemaFor(request.method as never);
      const params = paramsSchema.parse(request.params) as Record<string, unknown>;

      const result = await this._dispatch(request.method, params, ac.signal);
      if (disconnected) {
        process.stderr.write(`[daemon] client disconnected mid-call (${request.method})\n`);
        return;
      }
      this._writeResponse(socket, { id, ok: true, result });
      socket.end();
    } catch (err) {
      if (disconnected) {
        process.stderr.write(
          `[daemon] aborted ${request?.method ?? 'unknown'} due to client disconnect\n`,
        );
        return;
      }
      const wire = mapErrorToWire(err);
      this._writeResponse(socket, {
        id: request?.id ?? '',
        ok: false,
        error: wire,
      });
      try {
        socket.end();
      } catch {
        // ignore
      }
    } finally {
      this._inflight.delete(ac);
    }
  }

  private async _dispatch(
    method: string,
    params: Record<string, unknown>,
    abortSignal: AbortSignal,
  ): Promise<unknown> {
    const session = this._session;
    switch (method) {
      case 'wait_for_ready': {
        // session.waitForReady does not accept abortSignal; race against abort.
        const timeoutMs = params['timeoutMs'] as number | undefined;
        return this._raceAbort(session.waitForReady({ timeoutMs }), abortSignal);
      }
      case 'wait_for_next_ready': {
        const timeoutMs = params['timeoutMs'] as number | undefined;
        const commandName = params['commandName'] as string | undefined;
        return this._raceAbort(
          session.waitForNextReady({ timeoutMs, commandName }),
          abortSignal,
        );
      }
      case 'list_commands': {
        return { commands: session.listCommands() };
      }
      case 'get_command_status': {
        const commandName = params['commandName'] as string;
        return { status: session.getCommandStatus(commandName) };
      }
      case 'start_command': {
        const commandName = params['commandName'] as string;
        return session.startCommand(commandName);
      }
      case 'stop_command': {
        const commandName = params['commandName'] as string;
        return session.stopCommand(commandName);
      }
      case 'restart_command': {
        const commandName = params['commandName'] as string;
        return session.restartCommand(commandName);
      }
      case 'read_command_logs': {
        const commandName = params['commandName'] as string;
        const since = params['since'] as number | undefined;
        const limit = params['limit'] as number | undefined;
        const lines = await session.readCommandLogs({ commandName, since, limit });
        return { lines };
      }
      case 'stop_session': {
        await this._handleStopSession();
        return { stopped: true };
      }
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private async _handleStopSession(): Promise<void> {
    // Close listener so no new connections, but allow current response to flush.
    const server = this._server;
    if (server !== null) {
      server.close();
      this._server = null;
    }
    for (const ac of this._inflight) {
      // Don't abort ourselves
      ac.abort(new Error('SHUTTING_DOWN'));
    }
    this._shuttingDown = true;
    await this._session.stop();
    // Write final meta as 'stopped'.
    try {
      // Discover sessionId from socketPath: parent dir name.
      const parts = this._socketPath.split('/');
      const sessionId = parts[parts.length - 2] ?? '';
      const dir = sessionDirFn(sessionId);
      const mp = metaPathFn(sessionId);
      if (fs.existsSync(mp) && fs.existsSync(dir)) {
        const meta = readMeta(sessionId);
        writeMeta(sessionId, { ...meta, status: 'stopped' });
      }
    } catch {
      // best-effort
    }
    // Emit shutdown event so daemon entry can process.exit after response flushes.
    setImmediate(() => this.emit('shutdown'));
  }

  private _writeResponse(socket: net.Socket, response: IpcResponse): void {
    try {
      socket.write(JSON.stringify(response) + '\n');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EPIPE' || code === 'ECONNRESET') {
        process.stderr.write(`[daemon] dropped response (client disconnected)\n`);
      } else {
        process.stderr.write(`[daemon] write error: ${(err as Error).message}\n`);
      }
    }
  }

  private async _raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('aborted');
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        signal.removeEventListener('abort', onAbort);
        reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
      };
      signal.addEventListener('abort', onAbort);
      p.then(
        (v) => {
          signal.removeEventListener('abort', onAbort);
          resolve(v);
        },
        (e) => {
          signal.removeEventListener('abort', onAbort);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });
  }
}
