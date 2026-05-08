import { describe, expect, it } from 'vitest';
import { NotImplementedError } from '@sst-puppeteer/core';
import { NodePtyAdapter } from '../src/index.js';

describe('NodePtyAdapter smoke', () => {
  it('instantiates without throwing', () => {
    expect(() => new NodePtyAdapter()).not.toThrow();
  });

  it('pid is null before spawn', () => {
    const adapter = new NodePtyAdapter();
    expect(adapter.pid).toBeNull();
  });

  it('write throws NotImplementedError before spawn', () => {
    const adapter = new NodePtyAdapter();
    expect(() => adapter.write('x')).toThrow(NotImplementedError);
  });

  it('onData throws NotImplementedError before spawn', () => {
    const adapter = new NodePtyAdapter();
    expect(() => adapter.onData(() => {})).toThrow(NotImplementedError);
  });

  it('onExit throws NotImplementedError before spawn', () => {
    const adapter = new NodePtyAdapter();
    expect(() => adapter.onExit(() => {})).toThrow(NotImplementedError);
  });
});
