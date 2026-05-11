import { describe, expect, it } from 'vitest';
import { Command, defaultRegistry } from '../../src/cli/index.js';

describe('cli command polymorphism', () => {
  it('defaultRegistry registers exactly 1 command (VersionCommand)', () => {
    const registry = defaultRegistry();
    expect(registry.size()).toBe(1);
    expect(registry.list()).toHaveLength(1);
    expect(registry.names()).toContain('version');
  });

  it('every registered command is an instance of Command', () => {
    const registry = defaultRegistry();
    for (const cmd of registry.list()) {
      expect(cmd).toBeInstanceOf(Command);
    }
  });
});
