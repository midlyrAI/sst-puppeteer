import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveDaemonEntryPath, resolveEntryMode } from '../../src/session/spawn.js';

describe('session/spawn-paths', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env['SST_PUPPETEER_DAEMON_ENTRY'];
    delete process.env['SST_PUPPETEER_DAEMON_ENTRY'];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env['SST_PUPPETEER_DAEMON_ENTRY'];
    else process.env['SST_PUPPETEER_DAEMON_ENTRY'] = saved;
  });

  it('resolveDaemonEntryPath returns the value of SST_PUPPETEER_DAEMON_ENTRY', () => {
    process.env['SST_PUPPETEER_DAEMON_ENTRY'] = '/abs/path/to/cli.js';
    expect(resolveDaemonEntryPath()).toBe('/abs/path/to/cli.js');
  });

  it('resolveDaemonEntryPath throws when env var is unset', () => {
    expect(() => resolveDaemonEntryPath()).toThrow(/SST_PUPPETEER_DAEMON_ENTRY not set/);
  });

  it('resolveDaemonEntryPath throws when env var is empty string', () => {
    process.env['SST_PUPPETEER_DAEMON_ENTRY'] = '';
    expect(() => resolveDaemonEntryPath()).toThrow(/SST_PUPPETEER_DAEMON_ENTRY not set/);
  });

  it('resolveEntryMode("bin/cli.js") is "fork"', () => {
    expect(resolveEntryMode('/some/dist/bin/cli.js')).toBe('fork');
  });

  it('resolveEntryMode("bin/cli.ts") is "spawn-tsx"', () => {
    expect(resolveEntryMode('/some/bin/cli.ts')).toBe('spawn-tsx');
  });
});
