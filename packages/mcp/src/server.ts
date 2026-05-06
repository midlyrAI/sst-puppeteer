import { NotImplementedError, type SSTSession } from '@sst-puppeteer/core';
import { type ToolRegistry } from './tools/registry.js';
import { defaultRegistry } from './tools/index.js';
import { type Transport } from './transport.js';

export interface McpServerOptions {
  readonly session: SSTSession;
  readonly transport: Transport;
  readonly registry?: ToolRegistry;
}

export class McpServer {
  readonly session: SSTSession;
  readonly transport: Transport;
  readonly registry: ToolRegistry;

  constructor(opts: McpServerOptions) {
    this.session = opts.session;
    this.transport = opts.transport;
    this.registry = opts.registry ?? defaultRegistry();
  }

  async start(): Promise<void> {
    throw new NotImplementedError('McpServer.start');
  }

  async stop(): Promise<void> {
    throw new NotImplementedError('McpServer.stop');
  }
}

export const createMcpServer = (opts: McpServerOptions): McpServer => new McpServer(opts);
