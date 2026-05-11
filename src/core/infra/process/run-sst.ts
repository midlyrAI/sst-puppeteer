import { spawn } from 'node:child_process';
import { z } from 'zod';

export const RunSstOptionsSchema = z.object({
  projectDir: z.string(),
  args: z.array(z.string()),
  /** Convenience — when set, `--stage <stage>` is appended to `args` automatically. */
  stage: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  /** Default: 300_000 (5 min). */
  timeoutMs: z.number().optional(),
  /** Default: `'sst'`. Use a full path when sst is not on PATH. */
  sstCommand: z.string().optional(),
});
export type RunSstOptions = z.infer<typeof RunSstOptionsSchema>;

export const RunSstResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
  durationMs: z.number(),
  timedOut: z.boolean(),
});
export type RunSstResult = z.infer<typeof RunSstResultSchema>;

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
