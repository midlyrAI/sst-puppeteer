import { describe, expect, it } from 'vitest';
import { resolveEntryMode } from '../../src/cli/daemon/spawn.js';

describe('spawn-dev-mode', () => {
  it('Test 27: resolveEntryMode detects .ts and uses spawn path', () => {
    expect(resolveEntryMode('/foo/bin/cli.ts')).toBe('spawn-tsx');
    expect(resolveEntryMode('/foo/bin/cli.tsx')).toBe('spawn-tsx');
  });

  it('Test 27 (cont): resolveEntryMode detects .js and uses fork path', () => {
    expect(resolveEntryMode('/foo/dist/bin/cli.js')).toBe('fork');
  });
});
