import { NotImplementedError } from '../errors.js';

export abstract class Source<TEvent> {
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract [Symbol.asyncIterator](): AsyncIterator<TEvent>;

  protected throwNotImplemented(method: string): never {
    throw new NotImplementedError(`${this.constructor.name}.${method}`);
  }
}
