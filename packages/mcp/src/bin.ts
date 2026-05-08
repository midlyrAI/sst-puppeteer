#!/usr/bin/env node
import { NodePtyAdapter } from '@sst-puppeteer/pty-node';
import { SessionBuilder } from '@sst-puppeteer/core';
import { createMcpServer, StdioTransport } from './index.js';
import { type SessionFactory } from './server.js';

const parseArgs = (argv: readonly string[]): { projectDir: string } => {
  let projectDir = process.cwd();
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--project-dir' && argv[i + 1] !== undefined) {
      projectDir = argv[i + 1]!;
      i++;
    }
  }
  return { projectDir };
};

const main = async (): Promise<void> => {
  const { projectDir } = parseArgs(process.argv);

  const sessionFactory: SessionFactory = async ({
    projectDir: dir,
    stage,
    awsProfile,
    commands,
  }) => {
    return new SessionBuilder({
      adapter: new NodePtyAdapter(),
      projectDir: dir,
      stage,
      awsProfile,
      commands,
    }).build();
  };

  const server = createMcpServer({
    transport: new StdioTransport(),
    sessionFactory,
    defaultProjectDir: projectDir,
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
