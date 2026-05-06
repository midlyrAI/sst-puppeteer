import { Source } from './source.js';
import { type PtyAdapter } from '../types/pty.js';
import { type RawPtyEvent } from '../types/sources.js';

export class PtySource extends Source<RawPtyEvent> {
  constructor(private readonly _adapter: PtyAdapter) {
    super();
  }

  override start(): Promise<void> {
    void this._adapter;
    return this.throwNotImplemented('start');
  }

  override stop(): Promise<void> {
    return this.throwNotImplemented('stop');
  }

  override [Symbol.asyncIterator](): AsyncIterator<RawPtyEvent> {
    return this.throwNotImplemented('[Symbol.asyncIterator]');
  }
}
