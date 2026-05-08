import { describe, expect, it } from 'vitest';
import { PtySource } from '../../src/transport/pty-source.js';
import {
  type PtyAdapter,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
} from '../../src/api/pty-adapter.js';

class MockPtyAdapter implements PtyAdapter {
  readonly pid: number | null = null;
  private _dataHandlers: PtyDataHandler[] = [];

  _emit(data: string): void {
    for (const h of this._dataHandlers) {
      h(data);
    }
  }

  spawn(_opts: PtySpawnOptions): Promise<void> {
    return Promise.resolve();
  }

  write(_data: string): void {
    // no-op
  }

  onData(handler: PtyDataHandler): PtyUnsubscribe {
    this._dataHandlers.push(handler);
    return () => {
      this._dataHandlers = this._dataHandlers.filter((h) => h !== handler);
    };
  }

  onExit(_handler: PtyExitHandler): PtyUnsubscribe {
    return () => {};
  }

  resize(_cols: number, _rows: number): void {
    // no-op
  }

  kill(_signal?: string): void {
    // no-op
  }
}

describe('PtySource', () => {
  it('Test 1: start() then emit → iterator yields one RawPtyEvent with matching raw', async () => {
    const adapter = new MockPtyAdapter();
    const source = new PtySource(adapter);

    await source.start();

    const iter = source[Symbol.asyncIterator]();

    const emitPromise = Promise.resolve().then(() => {
      adapter._emit('hello\n');
    });

    const [resultEvent] = await Promise.all([iter.next(), emitPromise]);

    expect(resultEvent.done).toBe(false);
    if (!resultEvent.done) {
      expect(resultEvent.value.source).toBe('pty');
      expect(resultEvent.value.raw).toBe('hello\n');
      expect(typeof resultEvent.value.timestamp).toBe('number');
    }

    await source.stop();
  });

  it('Test 2: rolling buffer caps at 64 KB when 100 KB is emitted', async () => {
    const adapter = new MockPtyAdapter();
    const source = new PtySource(adapter);

    await source.start();

    const iter = source[Symbol.asyncIterator]();
    const chunk = 'a'.repeat(1024); // 1 KB chunk

    const collected: Promise<
      IteratorResult<{ source: string; raw: string; stripped: string; timestamp: number }>
    >[] = [];
    for (let i = 0; i < 100; i++) {
      adapter._emit(chunk);
    }

    for (let i = 0; i < 100; i++) {
      collected.push(iter.next());
    }

    const results = await Promise.all(collected);
    expect(results.length).toBe(100);

    const privateSource = source as unknown as { _buffer: string };
    expect(privateSource._buffer.length).toBeLessThanOrEqual(64 * 1024);

    await source.stop();
  });

  it('Test 3: stop() causes iterator to complete after draining pending events', async () => {
    const adapter = new MockPtyAdapter();
    const source = new PtySource(adapter);

    await source.start();
    adapter._emit('event-before-stop\n');
    await source.stop();

    const iter = source[Symbol.asyncIterator]();

    const first = await iter.next();
    expect(first.done).toBe(false);
    if (!first.done) {
      expect(first.value.raw).toBe('event-before-stop\n');
    }

    const second = await iter.next();
    expect(second.done).toBe(true);
  });

  it('Test 4: idempotent start() and stop() — calling twice does not throw', async () => {
    const adapter = new MockPtyAdapter();
    const source = new PtySource(adapter);

    await expect(source.start()).resolves.toBeUndefined();
    await expect(source.start()).resolves.toBeUndefined();

    await expect(source.stop()).resolves.toBeUndefined();
    await expect(source.stop()).resolves.toBeUndefined();
  });

  it('ANSI codes are stripped from the stripped field', async () => {
    const adapter = new MockPtyAdapter();
    const source = new PtySource(adapter);

    await source.start();

    const iter = source[Symbol.asyncIterator]();

    const emitPromise = Promise.resolve().then(() => {
      adapter._emit('\x1b[32mHello\x1b[0m');
    });

    const [result] = await Promise.all([iter.next(), emitPromise]);

    expect(result.done).toBe(false);
    if (!result.done) {
      expect(result.value.raw).toBe('\x1b[32mHello\x1b[0m');
      expect(result.value.stripped).toBe('Hello');
    }

    await source.stop();
  });
});
