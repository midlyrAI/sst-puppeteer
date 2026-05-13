/**
 * vitest globalSetup for the e2e suite.
 *
 * Responsibilities:
 *   1. Build `cli/dist/` and `mcp/dist/` so the tests can spawn the real bins.
 *   2. Materialize `e2e/fixtures/fake-sst/node_modules/.bin/sst` — a POSIX
 *      symlink to `../../bin/sst`, or a bash shim on Windows. This is
 *      runtime-created (NOT git-committed) per `.omc/plans/e2e-fixture-v2.md`
 *      §3.1a so Windows checkouts and security scanners don't trip over a
 *      committed symlink.
 *   3. Assert the resolved shim path matches `bin/sst` via `fs.realpathSync`.
 *
 * Failure modes are fatal — globalSetup throws and vitest aborts the run
 * with a clear message rather than letting downstream tests hang.
 */
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const fixtureDir = path.join(repoRoot, 'e2e', 'fixtures', 'fake-sst');
const binDir = path.join(fixtureDir, 'node_modules', '.bin');
const shimPath = path.join(binDir, 'sst');
const targetPath = path.resolve(fixtureDir, 'bin', 'sst');

export default async function setup(): Promise<void> {
  // 1. Fresh build with piped stdio so CI logs stay quiet on success.
  try {
    execSync("pnpm -r --filter './cli' --filter './mcp' build", {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString('utf8') ?? '';
    throw new Error(`e2e globalSetup: pnpm build failed\n${stderr}`);
  }

  // 2. Assert critical artifacts exist.
  for (const rel of [
    'cli/dist/cli/bin/sst-puppeteer.js',
    'mcp/dist/mcp/bin/sst-puppeteer-mcp.js',
  ]) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`e2e globalSetup: missing build artifact ${rel}`);
    }
  }

  // 3. Materialize the runtime shim. Idempotent — clear any prior entry.
  fs.mkdirSync(binDir, { recursive: true });
  try {
    fs.rmSync(shimPath, { force: true });
  } catch {
    // ENOENT is fine
  }

  if (process.platform === 'win32') {
    // Windows: 2-line bash shim. The repo doesn't ship `node-pty` Windows
    // binaries, so this branch is defensive — see fake-sst/README.md.
    fs.writeFileSync(shimPath, `#!/usr/bin/env bash\nexec "${targetPath}" "$@"\n`, { mode: 0o755 });
  } else {
    fs.symlinkSync(targetPath, shimPath, 'file');
  }

  // 4. Assert the resolved path matches.
  const resolved = fs.realpathSync(shimPath);
  if (resolved !== targetPath) {
    throw new Error(`e2e globalSetup: shim resolves to ${resolved}, expected ${targetPath}`);
  }
}
