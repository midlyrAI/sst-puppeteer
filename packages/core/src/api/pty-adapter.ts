/**
 * Runtime-agnostic PTY adapter contract.
 *
 * Implementations live in `@sst-puppeteer/pty-node` and `@sst-puppeteer/pty-bun`.
 * Core code never imports `node-pty` or `bun:*` directly — it accepts a
 * `PtyAdapter` via constructor injection (see `SessionOptions.adapter`).
 */
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

export interface PtyAdapter {
  readonly pid: number | null;
  spawn(opts: PtySpawnOptions): Promise<void>;
  write(data: string): void;
  onData(handler: PtyDataHandler): PtyUnsubscribe;
  onExit(handler: PtyExitHandler): PtyUnsubscribe;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}
