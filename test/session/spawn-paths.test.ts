import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveDaemonEntryPath, resolveEntryMode } from '../../src/session/spawn.js';

describe('session/spawn-paths', () => {
  it('resolveDaemonEntryPath returns bin/cli.ts in dev (two-up from src/session/)', () => {
    const p = resolveDaemonEntryPath();
    // Tests run in dev (tsx) — entry must end with bin/cli.ts.
    expect(p).toMatch(/\/bin\/cli\.ts$/);
    // The file must actually exist on disk.
    expect(fs.statSync(p).isFile()).toBe(true);
  });

  it('resolveEntryMode is "spawn-tsx" for the resolved dev path', () => {
    expect(resolveEntryMode()).toBe('spawn-tsx');
  });

  it('resolveEntryMode("bin/cli.js") is "fork"', () => {
    expect(resolveEntryMode('/some/dist/bin/cli.js')).toBe('fork');
  });
});
