import { type PtyAdapter, type PtyUnsubscribe } from '../api/pty-adapter.js';
import { stripAnsi } from './ansi.js';

/**
 * One stripped/raw chunk emitted by {@link PtySource}.
 */
export interface RawPtyEvent {
  readonly source: 'pty';
  readonly timestamp: number;
  readonly raw: string;
  readonly stripped: string;
}

const MAX_BUFFER = 64 * 1024; // 64 KB rolling buffer

/**
 * Tail the parent SST PTY's stdout, exposing each chunk as an async-iterable
 * event with both raw and ANSI-stripped variants.
 *
 * Used by `SSTSession` for the early-exit diagnostic ring buffer.
 */
export class PtySource {
  private _buffer = '';
  private readonly _queue: RawPtyEvent[] = [];
  private _resolveNext: (() => void) | null = null;
  private _unsubscribe: PtyUnsubscribe | null = null;
  private _started = false;
  private _stopped = false;

  constructor(private readonly _adapter: PtyAdapter) {}

  async start(): Promise<void> {
    if (this._started) return;
    this._started = true;

    this._unsubscribe = this._adapter.onData((chunk: string) => {
      this._buffer += chunk;
      if (this._buffer.length > MAX_BUFFER) {
        this._buffer = this._buffer.slice(this._buffer.length - MAX_BUFFER);
      }

      const event: RawPtyEvent = {
        source: 'pty',
        timestamp: Date.now(),
        raw: chunk,
        stripped: stripAnsi(chunk),
      };
      this._queue.push(event);

      if (this._resolveNext !== null) {
        const resolve = this._resolveNext;
        this._resolveNext = null;
        resolve();
      }
    });
  }

  async stop(): Promise<void> {
    if (this._stopped) return;
    this._stopped = true;

    if (this._unsubscribe !== null) {
      this._unsubscribe();
      this._unsubscribe = null;
    }

    if (this._resolveNext !== null) {
      const resolve = this._resolveNext;
      this._resolveNext = null;
      resolve();
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<RawPtyEvent> {
    return {
      next: async (): Promise<IteratorResult<RawPtyEvent>> => {
        for (;;) {
          const event = this._queue.shift();
          if (event !== undefined) {
            return { done: false, value: event };
          }
          if (this._stopped) {
            return { done: true, value: undefined };
          }
          await new Promise<void>((resolve) => {
            this._resolveNext = resolve;
          });
        }
      },
    };
  }
}
