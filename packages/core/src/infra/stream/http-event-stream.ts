import { type Logger } from '../../common/logger/logger.js';
import { StreamConnectionError } from '../../common/error/errors.js';
import { NoopLogger } from '../../common/logger/logger.js';

/**
 * Structural shape consumed by code that subscribes to an event stream.
 * Internal type — not part of the public API. `HttpEventStream` is the
 * canonical implementation; tests pass plain objects matching this shape
 * via TypeScript structural typing.
 */
export interface EventStreamLike<TEvent> {
  start(opts: { url: string; signal?: AbortSignal }): Promise<void>;
  onEvent(handler: (event: TEvent) => void): () => void;
  onError(handler: (err: Error) => void): () => void;
  stop(): Promise<void>;
}

// SST's `project.CompleteEvent` embeds the full Resources/Links/Outputs graph
// — a single deploy can produce a multi-megabyte NDJSON line. Cap is intentionally
// generous; it exists only to bound a truly broken server, not legitimate events.
const MAX_LINE_BYTES = 32 * 1024 * 1024;

export interface HttpEventStreamOptions {
  readonly fetchImpl?: typeof fetch;
  readonly logger?: Logger;
  /** Maximum reconnect attempts after the initial connection drops. Default: 3. */
  readonly maxReconnects?: number;
  /** Base backoff in ms; doubled on each retry. Default: 1000 (so 1s, 2s, 4s). */
  readonly reconnectBackoffMs?: number;
}

/**
 * HTTP NDJSON subscription with bounded reconnect-on-drop.
 *
 * Connects to `url`, reads the response body line-by-line, parses each
 * line as JSON, and dispatches to event handlers. On a clean stream end
 * or a network failure (parsed: socket reset, fetch reject) it retries
 * up to `maxReconnects` with exponential backoff. After the budget is
 * exhausted, a {@link StreamConnectionError} is delivered to error
 * handlers and the stream stops permanently.
 *
 * Per-line JSON parse errors do NOT abort the loop — they emit to
 * error handlers so the caller can decide to log/ignore.
 *
 * `stop()` is idempotent and may be called from any state.
 */
export class HttpEventStream<TEvent> implements EventStreamLike<TEvent> {
  private readonly _fetch: typeof fetch;
  private readonly _logger: Logger;
  private readonly _maxReconnects: number;
  private readonly _reconnectBackoffMs: number;

  private readonly _eventHandlers = new Set<(e: TEvent) => void>();
  private readonly _errorHandlers = new Set<(e: Error) => void>();

  private _abort: AbortController | null = null;
  private _externalSignal: AbortSignal | null = null;
  private _externalAbortListener: (() => void) | null = null;
  private _readLoop: Promise<void> | null = null;
  private _stopped = false;

  constructor(opts: HttpEventStreamOptions = {}) {
    this._fetch = opts.fetchImpl ?? fetch;
    this._logger = opts.logger ?? new NoopLogger();
    this._maxReconnects = opts.maxReconnects ?? 3;
    this._reconnectBackoffMs = opts.reconnectBackoffMs ?? 1_000;
  }

  async start(opts: { url: string; signal?: AbortSignal }): Promise<void> {
    if (this._readLoop || this._stopped) {
      throw new Error('HttpEventStream: already started or stopped');
    }
    this._abort = new AbortController();
    if (opts.signal) {
      this._externalSignal = opts.signal;
      const onAbort = () => this._abort?.abort();
      this._externalAbortListener = onAbort;
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort);
    }
    this._readLoop = this._runWithReconnect(opts.url, this._abort.signal).catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err));
      this._dispatchError(e);
    });
  }

  onEvent(handler: (event: TEvent) => void): () => void {
    this._eventHandlers.add(handler);
    return () => this._eventHandlers.delete(handler);
  }

  onError(handler: (err: Error) => void): () => void {
    this._errorHandlers.add(handler);
    return () => this._errorHandlers.delete(handler);
  }

  async stop(): Promise<void> {
    if (this._stopped) return;
    this._stopped = true;
    this._abort?.abort();
    if (this._externalSignal && this._externalAbortListener) {
      this._externalSignal.removeEventListener('abort', this._externalAbortListener);
    }
    this._externalSignal = null;
    this._externalAbortListener = null;
    if (this._readLoop) await this._readLoop.catch(() => undefined);
    this._readLoop = null;
  }

  private _dispatchEvent(event: TEvent): void {
    for (const h of this._eventHandlers) {
      try {
        h(event);
      } catch (err) {
        this._logger.error('HttpEventStream: event handler threw', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private _dispatchError(err: Error): void {
    for (const h of this._errorHandlers) {
      try {
        h(err);
      } catch (e) {
        this._logger.error('HttpEventStream: error handler threw', {
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  private async _runWithReconnect(url: string, signal: AbortSignal): Promise<void> {
    let attempt = 0;
    while (!this._stopped && !signal.aborted) {
      try {
        await this._runOnce(url, signal);
        if (this._stopped || signal.aborted) return;
        // Stream ended cleanly while we still want events — treat as a drop.
        attempt++;
      } catch (err) {
        if (signal.aborted || this._stopped) return;
        const e = err instanceof Error ? err : new Error(String(err));
        this._logger.warn('HttpEventStream: connection error', {
          attempt,
          err: e.message,
        });
        attempt++;
      }
      if (attempt > this._maxReconnects) {
        const exhausted = new StreamConnectionError(
          `HttpEventStream: exhausted ${this._maxReconnects} reconnect attempts to ${url}`,
          url,
          attempt - 1,
        );
        this._dispatchError(exhausted);
        return;
      }
      const backoff = this._reconnectBackoffMs * 2 ** (attempt - 1);
      this._logger.info('HttpEventStream: reconnect scheduled', { attempt, backoffMs: backoff });
      await this._sleep(backoff, signal);
    }
  }

  private async _runOnce(url: string, signal: AbortSignal): Promise<void> {
    const res = await this._fetch(url, { signal });
    if (!res.ok || !res.body) {
      throw new Error(`HttpEventStream: bad response ${res.status} from ${url}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    // Brace-depth scanner state: SST's /stream is concatenated JSON with no
    // delimiters between objects, despite the `application/x-ndjson` header.
    // We scan for top-level object boundaries instead of newlines.
    let depth = 0;
    let inString = false;
    let escaped = false;
    let scanFrom = 0;
    let objectStart = -1;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        for (let i = scanFrom; i < buf.length; i++) {
          const ch = buf.charCodeAt(i);
          if (escaped) {
            escaped = false;
            continue;
          }
          if (inString) {
            if (ch === 0x5c /* \ */) escaped = true;
            else if (ch === 0x22 /* " */) inString = false;
            continue;
          }
          if (ch === 0x22 /* " */) {
            inString = true;
            continue;
          }
          if (ch === 0x7b /* { */ || ch === 0x5b /* [ */) {
            if (depth === 0) objectStart = i;
            depth++;
          } else if (ch === 0x7d /* } */ || ch === 0x5d /* ] */) {
            depth--;
            if (depth === 0 && objectStart !== -1) {
              const slice = buf.slice(objectStart, i + 1);
              this._handleObject(slice);
              // Drop everything up to and including this object; reset scanner.
              buf = buf.slice(i + 1);
              i = -1; // for-loop ++i puts us at 0
              objectStart = -1;
            }
          }
        }
        scanFrom = buf.length;

        if (buf.length > MAX_LINE_BYTES) {
          throw new Error(
            `HttpEventStream: object buffer exceeded ${MAX_LINE_BYTES} bytes without closing`,
          );
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  }

  private _handleObject(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this._dispatchError(
        new Error(`HttpEventStream: failed to parse object as JSON: ${(err as Error).message}`),
      );
      return;
    }
    this._dispatchEvent(parsed as TEvent);
  }

  private _sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(t);
        resolve();
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
