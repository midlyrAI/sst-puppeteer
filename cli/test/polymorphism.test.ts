import { describe, expect, it } from 'vitest';
import { Command, defaultRegistry } from '../src/index.js';

describe('cli command polymorphism', () => {
  it('defaultRegistry registers the expected commands', () => {
    const registry = defaultRegistry();
    expect(registry.size()).toBe(13);
    const names = registry.names();
    for (const expected of [
      'version',
      'start',
      'stop',
      'list',
      'wait-for-ready',
      'wait-for-next-ready',
      'list-commands',
      'get-command-status',
      'read-command-logs',
      'start-command',
      'stop-command',
      'restart-command',
      'run-sst',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('every registered command is an instance of Command', () => {
    const registry = defaultRegistry();
    for (const cmd of registry.list()) {
      expect(cmd).toBeInstanceOf(Command);
    }
  });

  it('all registered commands are visible (no hidden commands in default registry)', () => {
    const registry = defaultRegistry();
    const visible = registry.list().filter((c) => !c.hidden);
    expect(visible).toHaveLength(13);
    expect(visible.find((c) => c.name === '__daemon')).toBeUndefined();
  });
});
