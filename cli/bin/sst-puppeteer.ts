#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { runDaemon } from '../../shared/src/session/daemon-entry.js';
import { CliRunner } from '../src/runner.js';
import { defaultRegistry } from '../src/commands/index.js';

// Stamp the daemon entry path so `resolveDaemonEntryPath()` in spawn.ts can
// find it without any path-resolution heuristics. Must be set BEFORE any
// session manager reads it (i.e. before dispatching to commands).
process.env['SST_PUPPETEER_DAEMON_ENTRY'] = fileURLToPath(import.meta.url);

const main = async (): Promise<void> => {
  if (process.argv[2] === '__daemon') {
    await runDaemon(process.argv[3] ?? '', {
      stdout: process.stdout,
      stderr: process.stderr,
    });
    // runDaemon never returns; this is unreachable.
    return;
  }

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
