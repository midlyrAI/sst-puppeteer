import { type StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NotImplementedError } from '@sst-puppeteer/core';

export abstract class Transport {
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
}

export class StdioTransport extends Transport {
  private _sdk: StdioServerTransport | null = null;
  private _started: boolean = false;

  getSdkTransport(): StdioServerTransport {
    if (this._sdk === null) {
      throw new Error('StdioTransport has not been started — call start() first.');
    }
    return this._sdk;
  }

  override async start(): Promise<void> {
    if (this._started) {
      throw new Error('StdioTransport.start() has already been called.');
    }
    this._started = true;
    // Dynamically import to keep the module loadable in non-Node environments at type-check time
    const { StdioServerTransport: SdkStdioServerTransport } =
      await import('@modelcontextprotocol/sdk/server/stdio.js');
    this._sdk = new SdkStdioServerTransport();
  }

  override async stop(): Promise<void> {
    if (!this._started) {
      return;
    }
    await this._sdk?.close();
    this._sdk = null;
    this._started = false;
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
