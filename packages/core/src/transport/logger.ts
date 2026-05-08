import { Logger, NoopLogger } from '../api/logger.js';

export { Logger, NoopLogger };

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
