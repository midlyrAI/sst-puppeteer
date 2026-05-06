import { Source } from './source.js';
import { type RawLogLine } from '../types/sources.js';

export class LogSource extends Source<RawLogLine> {
  constructor(private readonly _logDir: string) {
    super();
  }

  override start(): Promise<void> {
    void this._logDir;
    return this.throwNotImplemented('start');
  }

  override stop(): Promise<void> {
    return this.throwNotImplemented('stop');
  }

  override [Symbol.asyncIterator](): AsyncIterator<RawLogLine> {
    return this.throwNotImplemented('[Symbol.asyncIterator]');
  }
}
