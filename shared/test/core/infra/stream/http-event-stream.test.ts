import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { HttpEventStream } from '../../../../src/core/infra/stream/http-event-stream.js';
import { StreamConnectionError } from '../../../../src/core/common/error/errors.js';

interface FakeEvent {
  readonly type: string;
  readonly value?: unknown;
}

interface ConnectionState {
  closeAfterEvents?: number;
  totalConnections: number;
}

function startServer(
  state: ConnectionState,
  scriptPerConnection: ReadonlyArray<readonly string[]>,
): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const idx = state.totalConnections;
      state.totalConnections++;
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      const lines = scriptPerConnection[Math.min(idx, scriptPerConnection.length - 1)] ?? [];
      let i = 0;
      const interval = setInterval(() => {
        if (i >= lines.length) {
          clearInterval(interval);
          res.end();
          return;
        }
        res.write(String(lines[i]) + '\n');
        i++;
      }, 5);
      req.on('close', () => clearInterval(interval));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('HttpEventStream', () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (server) {
      await stopServer(server);
      server = null;
    }
  });

  it('parses NDJSON events in order', async () => {
    const state: ConnectionState = { totalConnections: 0 };
    const lines = [
      JSON.stringify({ type: 'a', value: 1 }),
      JSON.stringify({ type: 'b', value: 2 }),
      JSON.stringify({ type: 'c', value: 3 }),
    ];
    const started = await startServer(state, [lines]);
    server = started.server;

    const stream = new HttpEventStream<FakeEvent>({ maxReconnects: 0 });
    const received: FakeEvent[] = [];
    stream.onEvent((e) => received.push(e));
    await stream.start({ url: started.url });

    // Wait for the stream to drain
    await new Promise((r) => setTimeout(r, 200));
    await stream.stop();

    expect(received).toHaveLength(3);
    expect(received.map((e) => e.type)).toEqual(['a', 'b', 'c']);
    expect(received[0]?.value).toBe(1);
  });

  it('reconnects after mid-stream close and delivers events from the second connection', async () => {
    const state: ConnectionState = { totalConnections: 0 };
    const conn1 = [JSON.stringify({ type: 'first' })];
    const conn2 = [JSON.stringify({ type: 'second' }), JSON.stringify({ type: 'third' })];
    const started = await startServer(state, [conn1, conn2]);
    server = started.server;

    const stream = new HttpEventStream<FakeEvent>({ maxReconnects: 3, reconnectBackoffMs: 50 });
    const received: FakeEvent[] = [];
    stream.onEvent((e) => received.push(e));
    await stream.start({ url: started.url });

    await new Promise((r) => setTimeout(r, 500));
    await stream.stop();

    expect(state.totalConnections).toBeGreaterThanOrEqual(2);
    const types = received.map((e) => e.type);
    // First connection delivered exactly one event, then connection 2 (and any
    // subsequent retries before stop) delivered the second-connection script.
    expect(types[0]).toBe('first');
    expect(types).toContain('second');
    expect(types).toContain('third');
  });

  it('emits StreamConnectionError after exhausting reconnects', async () => {
    // Server that immediately closes the body, simulating a permanent flap.
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.end();
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const addr = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${addr.port}/`;

    const stream = new HttpEventStream<FakeEvent>({ maxReconnects: 2, reconnectBackoffMs: 20 });
    const errors: Error[] = [];
    stream.onError((e) => errors.push(e));
    await stream.start({ url });

    // Initial + 2 retries = 3 connections, all close immediately.
    await new Promise((r) => setTimeout(r, 500));
    await stream.stop();

    const exhausted = errors.find((e) => e instanceof StreamConnectionError) as
      | StreamConnectionError
      | undefined;
    expect(exhausted).toBeDefined();
    expect(exhausted?.url).toBe(url);
    expect(exhausted?.attempts).toBeGreaterThanOrEqual(2);
  });

  it('routes JSON parse errors to onError without crashing the loop', async () => {
    // Malformed object (depth balances but JSON.parse rejects), followed by a valid one.
    const state: ConnectionState = { totalConnections: 0 };
    const lines = ['{"a": NotJson}', JSON.stringify({ type: 'ok' })];
    const started = await startServer(state, [lines]);
    server = started.server;

    const stream = new HttpEventStream<FakeEvent>({ maxReconnects: 0 });
    const received: FakeEvent[] = [];
    const errors: Error[] = [];
    stream.onEvent((e) => received.push(e));
    stream.onError((e) => errors.push(e));
    await stream.start({ url: started.url });

    await new Promise((r) => setTimeout(r, 200));
    await stream.stop();

    expect(received).toEqual([{ type: 'ok' }]);
    expect(errors.some((e) => e.message.includes('parse object'))).toBe(true);
  });

  it('stop() is idempotent', async () => {
    const state: ConnectionState = { totalConnections: 0 };
    const started = await startServer(state, [[JSON.stringify({ type: 'x' })]]);
    server = started.server;
    const stream = new HttpEventStream<FakeEvent>({ maxReconnects: 0 });
    await stream.start({ url: started.url });
    await stream.stop();
    await stream.stop(); // second call must not throw
  });
});
