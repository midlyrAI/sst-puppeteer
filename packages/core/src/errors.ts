export class SstPuppeteerError extends Error {
  override readonly name: string = 'SstPuppeteerError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class NotImplementedError extends SstPuppeteerError {
  override readonly name = 'NotImplementedError';

  constructor(symbol: string) {
    super(`${symbol} is not implemented in v0.1 skeleton.`);
  }
}

export class DeployFailedError extends SstPuppeteerError {
  override readonly name = 'DeployFailedError';

  constructor(
    message: string,
    readonly resource?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export class InvocationFailedError extends SstPuppeteerError {
  override readonly name = 'InvocationFailedError';

  constructor(
    message: string,
    readonly functionName: string,
    readonly statusCode?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export class SourceParseError extends SstPuppeteerError {
  override readonly name = 'SourceParseError';

  constructor(
    message: string,
    readonly source: 'pty' | 'sse' | 'log',
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
