import { describe, expect, it } from 'vitest';
import {
  NotImplementedError,
  type PtyAdapter,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
  SSTSession,
} from '@sst-puppeteer/core';
import { Tool, TOOL_NAMES, defaultRegistry } from '../src/index.js';

class StubPtyAdapter implements PtyAdapter {
  readonly pid: number | null = null;
  async spawn(_o: PtySpawnOptions): Promise<void> {
    throw new NotImplementedError('stub.spawn');
  }
  write(_d: string): void {
    throw new NotImplementedError('stub.write');
  }
  onData(_h: PtyDataHandler): PtyUnsubscribe {
    throw new NotImplementedError('stub.onData');
  }
  onExit(_h: PtyExitHandler): PtyUnsubscribe {
    throw new NotImplementedError('stub.onExit');
  }
  resize(_c: number, _r: number): void {
    throw new NotImplementedError('stub.resize');
  }
  kill(): void {
    throw new NotImplementedError('stub.kill');
  }
}

const buildSession = (): SSTSession =>
  new SSTSession({ adapter: new StubPtyAdapter(), projectDir: '/tmp/x' });

describe('mcp tool polymorphism', () => {
  it('defaultRegistry registers exactly 6 tools', () => {
    const registry = defaultRegistry();
    expect(registry.size()).toBe(6);
    expect(registry.list().length).toBe(6);
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

  it('every tool execute() rejects with NotImplementedError', async () => {
    const registry = defaultRegistry();
    const session = buildSession();
    for (const tool of registry.list()) {
      await expect(tool.execute(session, {} as never)).rejects.toBeInstanceOf(NotImplementedError);
    }
  });
});
