import { NotImplementedError } from '@sst-puppeteer/core';

export abstract class Transport {
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
}

export class StdioTransport extends Transport {
  override async start(): Promise<void> {
    throw new NotImplementedError('StdioTransport.start');
  }

  override async stop(): Promise<void> {
    throw new NotImplementedError('StdioTransport.stop');
  }
}

export class HttpTransport extends Transport {
  constructor(private readonly _port: number) {
    super();
  }

  override async start(): Promise<void> {
    void this._port;
    throw new NotImplementedError('HttpTransport.start');
  }

  override async stop(): Promise<void> {
    throw new NotImplementedError('HttpTransport.stop');
  }
}
