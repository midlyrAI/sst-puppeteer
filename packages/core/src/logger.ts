export abstract class Logger {
  abstract info(msg: string, meta?: object): void;
  abstract warn(msg: string, meta?: object): void;
  abstract error(msg: string, meta?: object): void;
  abstract debug(msg: string, meta?: object): void;
}

export class NoopLogger extends Logger {
  override info(_msg: string, _meta?: object): void {}
  override warn(_msg: string, _meta?: object): void {}
  override error(_msg: string, _meta?: object): void {}
  override debug(_msg: string, _meta?: object): void {}
}

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
