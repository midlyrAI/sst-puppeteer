/**
 * Test-only contract describing the public surface of an event stream.
 * Mirrors `HttpEventStream`'s shape so test fakes can stand in via TS
 * structural typing (no production interface required).
 */
interface EventStreamShape<TEvent> {
  start(opts: { url: string; signal?: AbortSignal }): Promise<void>;
  stop(): Promise<void>;
  onEvent(h: (e: TEvent) => void): () => void;
  onError(h: (e: Error) => void): () => void;
}

/**
 * Hand-rolled in-memory event stream for tests. Lets a test push
 * events and errors into the session synchronously without touching the
 * network or filesystem.
 */
export class FakeEventStream<TEvent> implements EventStreamShape<TEvent> {
  private events = new Set<(e: TEvent) => void>();
  private errors = new Set<(e: Error) => void>();
  startCalls: { url: string }[] = [];
  stopped = false;

  async start(opts: { url: string }): Promise<void> {
    this.startCalls.push({ url: opts.url });
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  onEvent(h: (e: TEvent) => void): () => void {
    this.events.add(h);
    return () => {
      this.events.delete(h);
    };
  }

  onError(h: (e: Error) => void): () => void {
    this.errors.add(h);
    return () => {
      this.errors.delete(h);
    };
  }

  emit(e: TEvent): void {
    for (const h of this.events) h(e);
  }

  emitError(e: Error): void {
    for (const h of this.errors) h(e);
  }
}
