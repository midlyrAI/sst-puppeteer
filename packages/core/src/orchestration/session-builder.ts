import { type SessionOptions } from '../api/session-options.js';
import { NodePtyAdapter } from '../transport/node-pty-adapter.js';
import { SSTSession } from './session.js';

/**
 * Constructs an `SSTSession` with sensible defaults. Customers don't need
 * to provide a `PtyAdapter` — `SessionBuilder` will default to
 * `NodePtyAdapter` (which is the only impl we ship).
 *
 * @example
 * ```ts
 * import { SessionBuilder } from '@sst-puppeteer/core';
 *
 * const session = new SessionBuilder({
 *   projectDir: process.cwd(),
 *   stage: 'dev',
 * }).build();
 * await session.start();
 * ```
 */
export class SessionBuilder {
  constructor(private readonly options: SessionOptions) {}

  build(): SSTSession {
    const adapter = this.options.adapter ?? new NodePtyAdapter();
    return new SSTSession({ ...this.options, adapter });
  }
}
