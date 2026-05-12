import { describe, expect, it } from 'vitest';
import { Command, defaultRegistry } from '../../src/cli/index.js';

describe('cli command polymorphism', () => {
  it('defaultRegistry registers the expected commands', () => {
    const registry = defaultRegistry();
    expect(registry.size()).toBe(5);
    const names = registry.names();
    for (const expected of ['version', 'start', 'stop', 'list', '__daemon']) {
      expect(names).toContain(expected);
    }
  });

  it('every registered command is an instance of Command', () => {
    const registry = defaultRegistry();
    for (const cmd of registry.list()) {
      expect(cmd).toBeInstanceOf(Command);
    }
  });

  it('hidden commands are excluded from non-hidden listing', () => {
    const registry = defaultRegistry();
    const visible = registry.list().filter((c) => !c.hidden);
    expect(visible).toHaveLength(4);
    expect(visible.find((c) => c.name === '__daemon')).toBeUndefined();
  });
});
