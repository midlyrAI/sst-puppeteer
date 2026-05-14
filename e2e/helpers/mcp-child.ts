#!/usr/bin/env node
/**
 * Test-only MCP entry. Mirrors `bin/mcp.ts` exactly, except the
 * `SessionManager` is constructed with `fakeSpawnDaemon` so any
 * `start_session` call boots the test fake daemon instead of `sst dev`.
 *
 * Used by `mcp-child-process.ts` to spawn a real Node child for AC-3
 * (MCP restart preserves sessions).
 */
import { createMcpServer, StdioTransport } from '../../mcp/src/index.js';
import { SessionManager } from '../../shared/src/session/index.js';
import { fakeSpawnDaemon } from './fake-spawn-daemon.js';

const main = async (): Promise<void> => {
  const sessionManager = new SessionManager({ spawnDaemon: fakeSpawnDaemon });
  const server = createMcpServer({
    transport: new StdioTransport(),
    sessionManager,
  });

  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`fake-mcp: received ${signal}\n`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await server.start();
};

main().catch((err) => {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
