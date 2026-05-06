import { describe, expect, it } from 'vitest';
import {
  NotImplementedError,
  type PtyAdapter,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
  SSTSession,
} from '@sst-puppeteer/core';
import { McpServer, StdioTransport, createMcpServer } from '../src/index.js';

class StubPtyAdapter implements PtyAdapter {
  readonly pid: number | null = null;
  async spawn(_o: PtySpawnOptions): Promise<void> {
    throw new NotImplementedError('stub');
  }
  write(): void {
    throw new NotImplementedError('stub');
  }
  onData(_h: PtyDataHandler): PtyUnsubscribe {
    throw new NotImplementedError('stub');
  }
  onExit(_h: PtyExitHandler): PtyUnsubscribe {
    throw new NotImplementedError('stub');
  }
  resize(): void {
    throw new NotImplementedError('stub');
  }
  kill(): void {
    throw new NotImplementedError('stub');
  }
}

describe('McpServer smoke', () => {
  const buildServer = (): McpServer =>
    createMcpServer({
      session: new SSTSession({ adapter: new StubPtyAdapter(), projectDir: '/tmp/x' }),
      transport: new StdioTransport(),
    });

  it('createMcpServer returns an McpServer instance with a session, transport, and 6-tool registry', () => {
    const server = buildServer();
    expect(server).toBeInstanceOf(McpServer);
    expect(server.session).toBeInstanceOf(SSTSession);
    expect(server.transport).toBeInstanceOf(StdioTransport);
    expect(server.registry.size()).toBe(6);
  });

  it('start() and stop() both reject with NotImplementedError', async () => {
    const server = buildServer();
    await expect(server.start()).rejects.toBeInstanceOf(NotImplementedError);
    await expect(server.stop()).rejects.toBeInstanceOf(NotImplementedError);
  });
});
