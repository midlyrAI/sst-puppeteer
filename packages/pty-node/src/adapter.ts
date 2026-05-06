import {
  NotImplementedError,
  type PtyAdapter,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
} from '@sst-puppeteer/core';

export class NodePtyAdapter implements PtyAdapter {
  readonly pid: number | null = null;

  async spawn(_opts: PtySpawnOptions): Promise<void> {
    throw new NotImplementedError('NodePtyAdapter.spawn');
  }

  write(_data: string): void {
    throw new NotImplementedError('NodePtyAdapter.write');
  }

  onData(_handler: PtyDataHandler): PtyUnsubscribe {
    throw new NotImplementedError('NodePtyAdapter.onData');
  }

  onExit(_handler: PtyExitHandler): PtyUnsubscribe {
    throw new NotImplementedError('NodePtyAdapter.onExit');
  }

  resize(_cols: number, _rows: number): void {
    throw new NotImplementedError('NodePtyAdapter.resize');
  }

  kill(_signal?: string): void {
    throw new NotImplementedError('NodePtyAdapter.kill');
  }
}
