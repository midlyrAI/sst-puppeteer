import { Source } from './source.js';
import { type RawSseEvent } from '../types/sources.js';

export class SseSource extends Source<RawSseEvent> {
  constructor(private readonly _url: string) {
    super();
  }

  override start(): Promise<void> {
    void this._url;
    return this.throwNotImplemented('start');
  }

  override stop(): Promise<void> {
    return this.throwNotImplemented('stop');
  }

  override [Symbol.asyncIterator](): AsyncIterator<RawSseEvent> {
    return this.throwNotImplemented('[Symbol.asyncIterator]');
  }
}
