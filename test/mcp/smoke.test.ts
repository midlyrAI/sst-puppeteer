import { describe, expect, it } from 'vitest';
import { McpServer, Transport, createMcpServer } from '../../src/mcp/index.js';

class MockTransport extends Transport {
  override async start(): Promise<void> {}
  override async stop(): Promise<void> {}
}

describe('McpServer smoke', () => {
  const buildServer = (): McpServer =>
    createMcpServer({
      transport: new MockTransport(),
    });

  it('createMcpServer returns an McpServer instance with a transport and 12-tool registry', () => {
    const server = buildServer();
    expect(server).toBeInstanceOf(McpServer);
    expect(server.transport).toBeInstanceOf(MockTransport);
    expect(server.registry.size()).toBe(12);
  });

  it('start() and stop() are functions on the instance', () => {
    const server = buildServer();
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });

  it('stop() before start() is a no-op (does not throw)', async () => {
    const server = buildServer();
    await expect(server.stop()).resolves.toBeUndefined();
  });
});
