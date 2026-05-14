export class SstPuppeteerError extends Error {
  override readonly name: string = 'SstPuppeteerError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class NotImplementedError extends SstPuppeteerError {
  override readonly name = 'NotImplementedError';

  constructor(symbol: string) {
    super(`${symbol} is not implemented.`);
  }
}

export class UpdateFailedError extends SstPuppeteerError {
  override readonly name = 'UpdateFailedError';

  constructor(
    message: string,
    readonly resource?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export class CommandNotFoundError extends SstPuppeteerError {
  override readonly name = 'CommandNotFoundError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class CommandAlreadyRunningError extends SstPuppeteerError {
  override readonly name = 'CommandAlreadyRunningError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class CommandNotRunningError extends SstPuppeteerError {
  override readonly name = 'CommandNotRunningError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class ConfigNotFoundError extends SstPuppeteerError {
  override readonly name = 'ConfigNotFoundError';

  constructor(
    message: string,
    readonly configPath: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export class StreamConnectionError extends SstPuppeteerError {
  override readonly name = 'StreamConnectionError';

  constructor(
    message: string,
    readonly url: string,
    readonly attempts: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
