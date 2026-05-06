import {
  NotImplementedError,
  type PtyAdapter,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
} from '@sst-puppeteer/core';

export class BunPtyAdapter implements PtyAdapter {
  readonly pid: number | null = null;

  async spawn(_opts: PtySpawnOptions): Promise<void> {
    throw new NotImplementedError('BunPtyAdapter.spawn');
  }

  write(_data: string): void {
    throw new NotImplementedError('BunPtyAdapter.write');
  }

  onData(_handler: PtyDataHandler): PtyUnsubscribe {
    throw new NotImplementedError('BunPtyAdapter.onData');
  }

  onExit(_handler: PtyExitHandler): PtyUnsubscribe {
    throw new NotImplementedError('BunPtyAdapter.onExit');
  }

  resize(_cols: number, _rows: number): void {
    throw new NotImplementedError('BunPtyAdapter.resize');
  }

  kill(_signal?: string): void {
    throw new NotImplementedError('BunPtyAdapter.kill');
  }
}
