#!/usr/bin/env node
/**
 * sst-puppeteer MCP server entrypoint.
 *
 * Stdout is reserved for the MCP protocol (stdio transport) — every log
 * line, error trace, or diagnostic MUST go to stderr. A single stray
 * `console.log` will corrupt the JSON-RPC stream and the host will drop
 * the connection.
 */
import { SessionBuilder } from '../src/core/index.js';
import { createMcpServer, StdioTransport } from '../src/mcp/index.js';
import { type SessionFactory } from '../src/mcp/server.js';

const sessionFactory: SessionFactory = async (opts) => new SessionBuilder(opts).build();

const main = async (): Promise<void> => {
  const server = createMcpServer({
    transport: new StdioTransport(),
    sessionFactory,
  });

  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`Received ${signal}, shutting down...\n`);
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
