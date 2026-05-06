import { describe, expect, it } from 'vitest';
import { NotImplementedError } from '@sst-puppeteer/core';
import { BunPtyAdapter } from '../src/index.js';

describe('BunPtyAdapter smoke', () => {
  it('instantiates with pid === null', () => {
    const adapter = new BunPtyAdapter();
    expect(adapter.pid).toBeNull();
  });

  it('throws NotImplementedError from every method', async () => {
    const adapter = new BunPtyAdapter();
    await expect(
      adapter.spawn({ command: 'sst', args: ['dev'], cwd: '/tmp' }),
    ).rejects.toBeInstanceOf(NotImplementedError);
    expect(() => adapter.write('x')).toThrow(NotImplementedError);
    expect(() => adapter.onData(() => {})).toThrow(NotImplementedError);
    expect(() => adapter.onExit(() => {})).toThrow(NotImplementedError);
    expect(() => adapter.resize(80, 24)).toThrow(NotImplementedError);
    expect(() => adapter.kill()).toThrow(NotImplementedError);
  });
});
