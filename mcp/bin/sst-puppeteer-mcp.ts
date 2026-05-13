#!/usr/bin/env node
/**
 * sst-puppeteer MCP server entrypoint.
 *
 * Stdout is reserved for the MCP protocol (stdio transport) — every log
 * line, error trace, or diagnostic MUST go to stderr. A single stray
 * `console.log` will corrupt the JSON-RPC stream and the host will drop
 * the connection.
 */
import { fileURLToPath } from 'node:url';
import { runDaemon } from '../../shared/src/session/daemon-entry.js';
import { createMcpServer, StdioTransport } from '../src/index.js';

// Stamp the daemon entry path so `resolveDaemonEntryPath()` in spawn.ts can
// find it without any path-resolution heuristics.
process.env['SST_PUPPETEER_DAEMON_ENTRY'] = fileURLToPath(import.meta.url);

const main = async (): Promise<void> => {
  if (process.argv[2] === '__daemon') {
    await runDaemon(process.argv[3] ?? '', {
      stdout: process.stdout,
      stderr: process.stderr,
    });
    return;
  }

  const server = createMcpServer({
    transport: new StdioTransport(),
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
