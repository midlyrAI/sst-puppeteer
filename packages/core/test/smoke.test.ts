import { describe, expect, it } from 'vitest';
import {
  NotImplementedError,
  type PtyAdapter,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
  SSTSession,
} from '../src/index.js';

class MockPtyAdapter implements PtyAdapter {
  readonly pid: number | null = null;
  spawn(_opts: PtySpawnOptions): Promise<void> {
    throw new NotImplementedError('MockPtyAdapter.spawn');
  }
  write(_data: string): void {
    throw new NotImplementedError('MockPtyAdapter.write');
  }
  onData(_handler: PtyDataHandler): PtyUnsubscribe {
    throw new NotImplementedError('MockPtyAdapter.onData');
  }
  onExit(_handler: PtyExitHandler): PtyUnsubscribe {
    throw new NotImplementedError('MockPtyAdapter.onExit');
  }
  resize(_cols: number, _rows: number): void {
    throw new NotImplementedError('MockPtyAdapter.resize');
  }
  kill(_signal?: string): void {
    throw new NotImplementedError('MockPtyAdapter.kill');
  }
}

describe('SSTSession smoke', () => {
  const buildSession = (): SSTSession =>
    new SSTSession({ adapter: new MockPtyAdapter(), projectDir: '/tmp/fake-project' });

  it('constructs and assigns an id + projectDir', () => {
    const session = buildSession();
    expect(session.id).toMatch(/^sst-session-/);
    expect(session.projectDir).toBe('/tmp/fake-project');
  });

  it('throws NotImplementedError from every public method', async () => {
    const session = buildSession();
    expect(() => session.state).toThrow(NotImplementedError);
    await expect(session.start()).rejects.toBeInstanceOf(NotImplementedError);
    await expect(session.stop()).rejects.toBeInstanceOf(NotImplementedError);
    await expect(session.waitForReady()).rejects.toBeInstanceOf(NotImplementedError);
    await expect(session.waitForRedeploy()).rejects.toBeInstanceOf(NotImplementedError);
    await expect(session.invokeFunction('api', {})).rejects.toBeInstanceOf(NotImplementedError);
    await expect(session.readLogs({ functionName: 'api' })).rejects.toBeInstanceOf(
      NotImplementedError,
    );
    expect(() => session.listFunctions()).toThrow(NotImplementedError);
    expect(() => session.recentInvocations('api')).toThrow(NotImplementedError);
    expect(() => session.on('log-line', () => {})).toThrow(NotImplementedError);
  });
});
