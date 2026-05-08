/**
 * Structured logger contract used across all sst-puppeteer layers.
 *
 * Implementations live in {@link ../transport/logger.js} (`ConsoleLogger`,
 * `NoopLogger`). Domain code accepts a `Logger` via constructor injection;
 * transport code does the same.
 */
export abstract class Logger {
  abstract info(msg: string, meta?: object): void;
  abstract warn(msg: string, meta?: object): void;
  abstract error(msg: string, meta?: object): void;
  abstract debug(msg: string, meta?: object): void;
}

/**
 * No-op logger that silently discards all messages.
 *
 * Lives in the `api/` layer so domain code can import it without crossing
 * layer boundaries into `transport/`.
 */
export class NoopLogger extends Logger {
  override info(_msg: string, _meta?: object): void {}
  override warn(_msg: string, _meta?: object): void {}
  override error(_msg: string, _meta?: object): void {}
  override debug(_msg: string, _meta?: object): void {}
}
