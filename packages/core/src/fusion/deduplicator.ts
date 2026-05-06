import { NotImplementedError } from '../errors.js';
import { type SessionEvent } from '../types/events.js';

export class Deduplicator {
  constructor(private readonly _ttlMs: number) {}

  dedupe(_event: SessionEvent): boolean {
    void this._ttlMs;
    throw new NotImplementedError('Deduplicator.dedupe');
  }

  reset(): void {
    throw new NotImplementedError('Deduplicator.reset');
  }
}
