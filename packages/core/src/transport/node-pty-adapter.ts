import * as pty from 'node-pty';
import {
  type PtyAdapter,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
} from '../api/pty-adapter.js';

/**
 * Default {@link PtyAdapter} backed by `node-pty`.
 *
 * `sst dev` is a tcell-based TUI that requires a real terminal — plain
 * `child_process.spawn` won't render or accept keystrokes. `node-pty`
 * provides the missing pseudo-terminal layer (`forkpty(3)` on Unix,
 * ConPTY on Windows).
 */
export class NodePtyAdapter implements PtyAdapter {
  private _pty: pty.IPty | null = null;

  get pid(): number | null {
    return this._pty?.pid ?? null;
  }

  async spawn(opts: PtySpawnOptions): Promise<void> {
    if (this._pty !== null) {
      throw new Error('NodePtyAdapter: already spawned');
    }
    this._pty = pty.spawn(opts.command, [...opts.args], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      name: 'xterm-256color',
    });
  }

  write(data: string): void {
    if (this._pty === null) throw new Error('NodePtyAdapter: not spawned');
    this._pty.write(data);
  }

  onData(handler: PtyDataHandler): PtyUnsubscribe {
    if (this._pty === null) throw new Error('NodePtyAdapter: not spawned');
    const disposable = this._pty.onData(handler);
    return () => disposable.dispose();
  }

  onExit(handler: PtyExitHandler): PtyUnsubscribe {
    if (this._pty === null) throw new Error('NodePtyAdapter: not spawned');
    const disposable = this._pty.onExit(({ exitCode, signal }) => {
      const sig: number | null = typeof signal === 'number' ? signal : null;
      handler(exitCode ?? null, sig);
    });
    return () => disposable.dispose();
  }

  resize(cols: number, rows: number): void {
    this._pty?.resize(cols, rows);
  }

  kill(signal?: string): void {
    this._pty?.kill(signal ?? 'SIGTERM');
  }
}
