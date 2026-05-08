import { afterEach, describe, expect, it } from 'vitest';
import { NodePtyAdapter } from '../src/index.js';

describe('NodePtyAdapter lifecycle', () => {
  let adapter: NodePtyAdapter | null = null;

  afterEach(() => {
    if (adapter !== null) {
      try {
        adapter.kill('SIGTERM');
      } catch {
        // already dead
      }
      adapter = null;
    }
  });

  it(
    'spawn → onData captures output → onExit fires with exitCode 0 → pid was a number > 0',
    async () => {
      adapter = new NodePtyAdapter();

      // pid is null before spawn
      expect(adapter.pid).toBeNull();

      await adapter.spawn({
        command: '/bin/bash',
        args: ['-c', 'printf hi; exit 0'],
        cwd: '/tmp',
      });

      // pid is a positive integer after spawn
      const spawnedPid = adapter.pid;
      expect(typeof spawnedPid).toBe('number');
      expect(spawnedPid).toBeGreaterThan(0);

      const chunks: string[] = [];
      const unsubData = adapter.onData((data) => {
        chunks.push(data);
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout: onExit never fired'));
        }, 4000);

        adapter!.onExit((code, _signal) => {
          clearTimeout(timeout);
          try {
            expect(code).toBe(0);
            resolve();
          } catch (err) {
            reject(err as Error);
          }
        });
      });

      unsubData();

      const output = chunks.join('');
      expect(output).toContain('hi');
    },
    { timeout: 5000 },
  );
});
