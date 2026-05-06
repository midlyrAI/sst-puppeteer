import { NotImplementedError } from '../errors.js';
import { type InvocationRecord } from '../types/state.js';

export class InvocationHistory {
  constructor(private readonly _limit: number) {}

  record(_invocation: InvocationRecord): void {
    void this._limit;
    throw new NotImplementedError('InvocationHistory.record');
  }

  recent(_functionName: string, _limit?: number): readonly InvocationRecord[] {
    throw new NotImplementedError('InvocationHistory.recent');
  }

  clear(): void {
    throw new NotImplementedError('InvocationHistory.clear');
  }
}
