import * as crypto from 'node:crypto';
import * as net from 'node:net';
import { IpcResponseSchema } from './protocol.js';

export class IpcCallError extends Error {
  override readonly name = 'IpcCallError';
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class IpcClient {
  private constructor(private readonly _socket: net.Socket) {}

  static connect(socketPath: string, timeoutMs = 2000): Promise<IpcClient> {
    return new Promise<IpcClient>((resolve, reject) => {
      const socket = net.connect(socketPath);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`IpcClient.connect timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(new IpcClient(socket));
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = crypto.randomUUID();
    const line = JSON.stringify({ id, method, params }) + '\n';
    return new Promise<unknown>((resolve, reject) => {
      let buf = '';
      const onData = (chunk: Buffer): void => {
        buf += chunk.toString('utf-8');
        const nl = buf.indexOf('\n');
        if (nl === -1) return;
        const lineRaw = buf.slice(0, nl);
        cleanup();
        try {
          const parsedRaw: unknown = JSON.parse(lineRaw);
          const parsed = IpcResponseSchema.parse(parsedRaw);
          if (parsed.ok) {
            resolve(parsed.result);
          } else {
            reject(new IpcCallError(parsed.error.code, parsed.error.message));
          }
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      const onError = (err: Error): void => {
        cleanup();
        reject(err);
      };
      const onEnd = (): void => {
        cleanup();
        reject(new Error('IPC socket closed before response'));
      };
      const cleanup = (): void => {
        this._socket.off('data', onData);
        this._socket.off('error', onError);
        this._socket.off('end', onEnd);
      };
      this._socket.on('data', onData);
      this._socket.once('error', onError);
      this._socket.once('end', onEnd);
      this._socket.write(line, (err) => {
        if (err) {
          cleanup();
          reject(err);
        }
      });
    });
  }

  close(): void {
    this._socket.destroy();
  }
}
