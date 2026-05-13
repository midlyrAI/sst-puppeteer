/**
 * MCP child-process helper targeting the built `dist/bin/mcp.js`. The
 * existing `test/helpers/mcp-child-process.ts` spawns the in-tree
 * `mcp-child.ts` (which uses the fake daemon spawn fn); the e2e suite
 * needs the real bin running with a real daemon spawn.
 *
 * Same JSON-RPC wire as `mcp-child-process.ts` — line-delimited messages
 * over stdin/stdout; tools/call wraps the call in MCP's `content` envelope.
 */
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}
interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export class McpDistChild {
  private readonly _child: ChildProcess & { stdin: Writable; stdout: Readable };
  private readonly _pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private _nextId = 1;
  private _stdoutBuf = '';
  private _exited = false;

  private constructor(child: ChildProcess & { stdin: Writable; stdout: Readable }) {
    this._child = child;
    child.stdout.on('data', (chunk: Buffer) => this._onStdout(chunk));
    child.on('exit', () => {
      this._exited = true;
      for (const p of this._pending.values()) p.reject(new Error('mcp child exited'));
      this._pending.clear();
    });
  }

  static async start(opts: { mcpEntry: string; env: NodeJS.ProcessEnv }): Promise<McpDistChild> {
    const child = nodeSpawn(process.execPath, [opts.mcpEntry], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, ...opts.env },
    }) as ChildProcess & { stdin: Writable; stdout: Readable };

    const handle = new McpDistChild(child);
    await handle._call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e-test', version: '0.0.0' },
    });
    handle._notify('notifications/initialized', {});
    return handle;
  }

  private _onStdout(chunk: Buffer): void {
    this._stdoutBuf += chunk.toString('utf-8');
    while (true) {
      const nl = this._stdoutBuf.indexOf('\n');
      if (nl === -1) break;
      const line = this._stdoutBuf.slice(0, nl);
      this._stdoutBuf = this._stdoutBuf.slice(nl + 1);
      if (line.trim() === '') continue;
      let msg: JsonRpcResponse | JsonRpcNotification;
      try {
        msg = JSON.parse(line) as JsonRpcResponse | JsonRpcNotification;
      } catch {
        continue;
      }
      if ('id' in msg && typeof msg.id === 'number') {
        const pending = this._pending.get(msg.id);
        if (pending !== undefined) {
          this._pending.delete(msg.id);
          if (msg.error !== undefined) pending.reject(new Error(msg.error.message));
          else pending.resolve(msg.result);
        }
      }
    }
  }

  private _send(req: JsonRpcRequest | JsonRpcNotification): void {
    if (this._exited) throw new Error('mcp child has exited');
    this._child.stdin.write(JSON.stringify(req) + '\n');
  }

  private _call(method: string, params: unknown): Promise<unknown> {
    const id = this._nextId++;
    return new Promise<unknown>((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private _notify(method: string, params: unknown): void {
    this._send({ jsonrpc: '2.0', method, params });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    return (await this._call('tools/call', { name, arguments: args })) as ToolCallResult;
  }

  /** Parse the first text content entry as JSON. */
  static parsePayload<T>(res: ToolCallResult): T {
    const text = res.content[0]?.text;
    if (text === undefined) {
      throw new Error(`tool result missing text content (raw=${JSON.stringify(res)})`);
    }
    if (res.isError === true) {
      throw new Error(`tool returned isError=true: ${text}`);
    }
    return JSON.parse(text) as T;
  }

  async kill(signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    if (this._exited) return;
    const exited = new Promise<void>((resolve) => {
      if (this._exited) return resolve();
      this._child.once('exit', () => resolve());
    });
    try {
      this._child.kill(signal);
    } catch {
      /* already gone */
    }
    const timer = setTimeout(() => {
      try {
        this._child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, 2000);
    await exited;
    clearTimeout(timer);
  }
}
