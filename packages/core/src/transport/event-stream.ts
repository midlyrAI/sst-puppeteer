/**
 * Generic NDJSON-style event stream contract.
 *
 * Implementations:
 * - {@link HttpEventStream} for HTTP NDJSON sources (e.g. SST `/stream`).
 *
 * The stream lifecycle is: construct -> `start({ url, signal? })` ->
 * receive events via `onEvent` / `onError` -> `stop()`.
 *
 * `onEvent` and `onError` may be called multiple times; both return an
 * unsubscribe function. Multiple handlers are supported.
 */
export interface EventStream<TEvent> {
  start(opts: { url: string; signal?: AbortSignal }): Promise<void>;
  onEvent(handler: (event: TEvent) => void): () => void;
  onError(handler: (err: Error) => void): () => void;
  stop(): Promise<void>;
}
