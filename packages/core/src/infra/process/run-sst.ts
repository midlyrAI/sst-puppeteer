import { spawn } from 'node:child_process';

export interface RunSstOptions {
  readonly projectDir: string;
  readonly args: readonly string[];
  /** Convenience — when set, `--stage <stage>` is appended to `args` automatically. */
  readonly stage?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Default: 300_000 (5 min). */
  readonly timeoutMs?: number;
  /** Default: `'sst'`. Use a full path when sst is not on PATH. */
  readonly sstCommand?: string;
}

export interface RunSstResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly timedOut: boolean;
}

/**
 * One-shot invocation of any `sst` subcommand (`deploy`, `remove`, `unlock`,
 * `secrets *`, `shell --`, `refresh`, …). For the long-running TUI
 * (`sst dev`), use `SSTSession` / `SessionBuilder` instead.
 *
 * Args are passed as an array — no shell interpolation, no injection.
 */
export async function runSst(opts: RunSstOptions): Promise<RunSstResult> {
  const startedAt = Date.now();
  const args = [...opts.args, ...(opts.stage ? ['--stage', opts.stage] : [])];
  const env: NodeJS.ProcessEnv = { ...process.env, ...(opts.env ?? {}) };
  const timeoutMs = opts.timeoutMs ?? 300_000;

  return new Promise<RunSstResult>((resolve, reject) => {
    const proc = spawn(opts.sstCommand ?? 'sst', args, {
      cwd: opts.projectDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 5_000).unref();
    }, timeoutMs);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });
  });
}
