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
 * Structural shape consumed by code that drives a PTY. Internal contract —
 * `NodePtyAdapter` is the canonical implementation, and tests pass plain
 * objects matching this shape via TypeScript structural typing.
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
