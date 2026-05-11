import { describe, expect, it } from 'vitest';
import { SessionBuilder } from '../../../src/core/domain/session/session-builder.js';
import { SSTSession } from '../../../src/core/domain/session/sst-session.js';
import { type Pty } from '../../../src/core/infra/pty/node-pty-adapter.js';
import { FakeEventStream } from '../../helpers/fake-event-stream.js';
import { type SstBusEvent } from '../../../src/core/infra/stream/sst-bus-event.js';

const noopAdapter: Pty = {
  pid: 1,
  async spawn() {},
  write() {},
  onData() {
    return () => {};
  },
  onExit() {
    return () => {};
  },
  resize() {},
  kill() {},
};

describe('SessionBuilder', () => {
  it('build() returns an SSTSession with default factories', () => {
    const session = new SessionBuilder({
      adapter: noopAdapter,
      projectDir: '/tmp/dummy',
    }).build();
    expect(session).toBeInstanceOf(SSTSession);
    expect(typeof session.id).toBe('string');
  });

  it('respects injected eventStreamFactory and paneLogWatcherFactory', () => {
    const stream = new FakeEventStream<SstBusEvent>();
    const session = new SessionBuilder({
      adapter: noopAdapter,
      projectDir: '/tmp/dummy',
      eventStreamFactory: () => stream,
      // PaneLogWatcher default factory is fine for a build-only test (no start()).
    }).build();
    expect(session).toBeInstanceOf(SSTSession);
  });
});
