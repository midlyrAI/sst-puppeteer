import * as pty from 'node-pty';

export interface PtySpawnOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly cols?: number;
  readonly rows?: number;
}

export type PtyDataHandler = (data: string) => void;
export type PtyExitHandler = (code: number | null, signal: number | null) => void;
export type PtyUnsubscribe = () => void;

/**
 * Structural shape consumed by code that drives a PTY. Kept as an internal
 * shape rather than a public interface — `NodePtyAdapter` is the canonical
 * implementation, and tests pass plain objects matching this shape via
 * TypeScript structural typing (no `implements` clause required).
 */
export interface Pty {
  readonly pid: number | null;
  spawn(opts: PtySpawnOptions): Promise<void>;
  write(data: string): void;
  onData(handler: PtyDataHandler): PtyUnsubscribe;
  onExit(handler: PtyExitHandler): PtyUnsubscribe;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

/**
 * Default PTY adapter backed by `node-pty`.
 *
 * `sst dev` is a tcell-based TUI that requires a real terminal — plain
 * `child_process.spawn` won't render or accept keystrokes. `node-pty`
 * provides the missing pseudo-terminal layer (`forkpty(3)` on Unix,
 * ConPTY on Windows).
 */
export class NodePtyAdapter implements Pty {
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
