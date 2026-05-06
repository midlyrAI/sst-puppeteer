#!/usr/bin/env node
import { CliRunner } from './runner.js';
import { defaultRegistry } from './commands/index.js';

const main = async (): Promise<void> => {
  const runner = new CliRunner({
    registry: defaultRegistry(),
    ctx: {
      stdout: process.stdout,
      stderr: process.stderr,
      cwd: process.cwd(),
    },
  });
  const code = await runner.run(process.argv);
  process.exit(code);
};

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
