#!/usr/bin/env node
import { NotImplementedError } from '@sst-puppeteer/core';

const main = async (): Promise<void> => {
  throw new NotImplementedError(
    'sst-puppeteer-mcp bin (will instantiate SSTSession + NodePtyAdapter + McpServer over StdioTransport when behavior lands)',
  );
};

main().catch((err) => {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
