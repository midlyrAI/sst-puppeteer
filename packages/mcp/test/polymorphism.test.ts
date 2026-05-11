import { describe, expect, it } from 'vitest';
import { Tool, TOOL_NAMES, defaultRegistry } from '../src/index.js';

describe('mcp tool polymorphism', () => {
  it('defaultRegistry registers exactly 10 tools', () => {
    const registry = defaultRegistry();
    expect(registry.size()).toBe(10);
    expect(registry.list().length).toBe(10);
  });

  it('every registered tool is an instance of Tool', () => {
    const registry = defaultRegistry();
    for (const tool of registry.list()) {
      expect(tool).toBeInstanceOf(Tool);
    }
  });

  it('registry names match TOOL_NAMES', () => {
    const registry = defaultRegistry();
    const names = [...registry.names()].sort();
    const expected = [...TOOL_NAMES].sort();
    expect(names).toEqual(expected);
  });
});
