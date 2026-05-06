import { NotImplementedError } from '../errors.js';
import { type SessionEvent } from '../types/events.js';
import { type RawSourceEvent } from '../types/sources.js';
import { type Source } from '../sources/source.js';

export type EventBusSubscriber = (event: SessionEvent) => void;

export class EventBus {
  private readonly _sources: ReadonlyArray<Source<RawSourceEvent>>;

  constructor(sources: ReadonlyArray<Source<RawSourceEvent>>) {
    this._sources = sources;
  }

  subscribe(_handler: EventBusSubscriber): () => void {
    void this._sources;
    throw new NotImplementedError('EventBus.subscribe');
  }

  start(): Promise<void> {
    throw new NotImplementedError('EventBus.start');
  }

  dispose(): Promise<void> {
    throw new NotImplementedError('EventBus.dispose');
  }
}
