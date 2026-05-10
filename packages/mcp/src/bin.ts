#!/usr/bin/env node
import { SessionBuilder } from '@sst-puppeteer/core';
import { createMcpServer, StdioTransport } from './index.js';
import { type SessionFactory } from './server.js';

const sessionFactory: SessionFactory = async ({ projectDir, stage, awsProfile, commands }) => {
  return new SessionBuilder({ projectDir, stage, awsProfile, commands }).build();
};

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
