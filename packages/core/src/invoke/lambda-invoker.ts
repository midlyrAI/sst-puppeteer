import { NotImplementedError } from '../errors.js';
import { type InvocationResult } from '../types/session.js';

export interface LambdaInvokerOptions {
  readonly region: string;
  readonly profile?: string;
}

export class LambdaInvoker {
  constructor(private readonly _options: LambdaInvokerOptions) {}

  invoke(_arn: string, _payload: unknown): Promise<InvocationResult> {
    void this._options;
    throw new NotImplementedError('LambdaInvoker.invoke');
  }
}
