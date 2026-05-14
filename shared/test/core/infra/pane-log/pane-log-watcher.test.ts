import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  PaneLogWatcher,
  type StartedEvent,
  type StoppedEvent,
} from '../../../../src/core/infra/pane-log/pane-log-watcher.js';

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('PaneLogWatcher', () => {
  let dir: string;
  let watcher: PaneLogWatcher | null = null;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'pane-log-watcher-'));
    mkdirSync(path.join(dir, '.sst', 'log'), { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      await watcher.stop();
      watcher = null;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('emits started when a fresh log file is written', async () => {
    watcher = new PaneLogWatcher({ projectDir: dir, pollIntervalMs: 50 });
    const started: StartedEvent[] = [];
    const stopped: StoppedEvent[] = [];
    watcher.onStarted((e) => started.push(e));
    watcher.onStopped((e) => stopped.push(e));
    watcher.addCommand('Service-Foo');

    const file = path.join(dir, '.sst', 'log', 'Service-Foo.log');
    writeFileSync(file, 'starting up\n');
    await wait(150);
    expect(started.map((e) => e.name)).toEqual(['Service-Foo']);
    expect(stopped).toHaveLength(0);
  });

  it('emits stopped after expectStop + a quiet window (no growth)', async () => {
    watcher = new PaneLogWatcher({
      projectDir: dir,
      pollIntervalMs: 25,
      stoppedWatchdogMs: 200,
    });
    const started: StartedEvent[] = [];
    const stopped: StoppedEvent[] = [];
    watcher.onStarted((e) => started.push(e));
    watcher.onStopped((e) => stopped.push(e));
    watcher.addCommand('Service-Bar');

    const file = path.join(dir, '.sst', 'log', 'Service-Bar.log');
    writeFileSync(file, 'running\n');
    await wait(80);
    expect(started.map((e) => e.name)).toEqual(['Service-Bar']);

    watcher.expectStop('Service-Bar');
    await wait(400);

    expect(stopped.map((e) => e.name)).toEqual(['Service-Bar']);
  });

  it('does not emit stopped while file is still being written after expectStop', async () => {
    watcher = new PaneLogWatcher({
      projectDir: dir,
      pollIntervalMs: 25,
      stoppedWatchdogMs: 150,
    });
    const stopped: StoppedEvent[] = [];
    watcher.onStopped((e) => stopped.push(e));
    watcher.addCommand('Service-Slow');

    const file = path.join(dir, '.sst', 'log', 'Service-Slow.log');
    writeFileSync(file, 'running\n');
    await wait(60);
    watcher.expectStop('Service-Slow');

    // Keep writing — quiet window must restart on each growth.
    for (let i = 0; i < 5; i++) {
      appendFileSync(file, `chatter ${i}\n`);
      await wait(60);
    }
    expect(stopped).toHaveLength(0);

    // Now go quiet long enough for the watchdog to fire.
    await wait(300);
    expect(stopped).toHaveLength(1);
  });

  it('does not emit started for a stale file with no growth after addCommand', async () => {
    const file = path.join(dir, '.sst', 'log', 'Service-Stale.log');
    writeFileSync(file, 'leftover from a previous run\n');

    watcher = new PaneLogWatcher({ projectDir: dir, pollIntervalMs: 30 });
    const started: StartedEvent[] = [];
    watcher.onStarted((e) => started.push(e));
    watcher.addCommand('Service-Stale');
    await wait(150);
    expect(started).toHaveLength(0);

    appendFileSync(file, 'new bytes\n');
    await wait(120);
    expect(started.map((e) => e.name)).toEqual(['Service-Stale']);
  });

  it('re-emits started after a stop -> new content cycle', async () => {
    watcher = new PaneLogWatcher({
      projectDir: dir,
      pollIntervalMs: 25,
      stoppedWatchdogMs: 100,
    });
    const started: StartedEvent[] = [];
    const stopped: StoppedEvent[] = [];
    watcher.onStarted((e) => started.push(e));
    watcher.onStopped((e) => stopped.push(e));
    watcher.addCommand('Service-Restart');

    const file = path.join(dir, '.sst', 'log', 'Service-Restart.log');
    writeFileSync(file, 'first run\n');
    await wait(80);
    expect(started).toHaveLength(1);

    watcher.expectStop('Service-Restart');
    await wait(250);
    expect(stopped).toHaveLength(1);

    appendFileSync(file, 'second run\n');
    await wait(120);
    expect(started).toHaveLength(2);
  });
});
