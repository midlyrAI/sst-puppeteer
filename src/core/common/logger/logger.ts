/**
 * Structured logger contract used across all sst-puppeteer layers.
 *
 * Domain code accepts a `Logger` via constructor injection; infra code does
 * the same. Three implementations live in this file:
 *
 * - {@link Logger} — abstract base class (the plug-point).
 * - {@link NoopLogger} — silently discards all messages.
 * - {@link ConsoleLogger} — forwards to `console.*`.
 */
export abstract class Logger {
  abstract info(msg: string, meta?: object): void;
  abstract warn(msg: string, meta?: object): void;
  abstract error(msg: string, meta?: object): void;
  abstract debug(msg: string, meta?: object): void;
}

/** No-op logger that silently discards all messages. */
export class NoopLogger extends Logger {
  override info(_msg: string, _meta?: object): void {}
  override warn(_msg: string, _meta?: object): void {}
  override error(_msg: string, _meta?: object): void {}
  override debug(_msg: string, _meta?: object): void {}
}

/** Logger implementation that forwards to `console.*`. */
export class ConsoleLogger extends Logger {
  override info(msg: string, meta?: object): void {
    console.info(msg, meta ?? '');
  }
  override warn(msg: string, meta?: object): void {
    console.warn(msg, meta ?? '');
  }
  override error(msg: string, meta?: object): void {
    console.error(msg, meta ?? '');
  }
  override debug(msg: string, meta?: object): void {
    console.debug(msg, meta ?? '');
  }
}
