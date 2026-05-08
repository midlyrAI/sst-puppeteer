import { type SessionOptions } from '../api/session-options.js';
import { SSTSession } from './session.js';

/**
 * Constructs an `SSTSession`. The session itself wires default factories at
 * `start()` time when they are not supplied — so this builder is a tiny
 * convenience: it gives the public construction surface a stable name and
 * lets callers swap in mocks for tests via {@link SessionOptions}.
 *
 * @example
 * ```ts
 * import { SessionBuilder } from '@sst-puppeteer/core';
 * import { NodePtyAdapter } from '@sst-puppeteer/pty-node';
 *
 * const session = new SessionBuilder({
 *   adapter: new NodePtyAdapter(),
 *   projectDir: process.cwd(),
 *   stage: 'dev',
 * }).build();
 * await session.start();
 * ```
 */
export class SessionBuilder {
  constructor(private readonly options: SessionOptions) {}

  build(): SSTSession {
    return new SSTSession(this.options);
  }
}
