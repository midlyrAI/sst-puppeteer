/**
 * Spawns the built CLI (`dist/bin/cli.js`) and captures its stdout/stderr.
 * Used by `lifecycle.e2e.test.ts` for the CLI half of the rotation.
 */
import { spawn as nodeSpawn } from 'node:child_process';

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCli(
  cliEntry: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = {},
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = nodeSpawn(process.execPath, [cliEntry, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      cwd: opts.cwd,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: CliResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString('utf-8');
    });
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString('utf-8');
    });
    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    child.on('exit', (code) => {
      finish({ code: code ?? -1, stdout, stderr });
    });
    if (opts.timeoutMs !== undefined) {
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        finish({ code: -1, stdout, stderr: stderr + `\n[timeout after ${opts.timeoutMs}ms]` });
      }, opts.timeoutMs);
      timer.unref();
    }
  });
}

export function parseJsonStdout<T>(res: CliResult): T {
  return JSON.parse(res.stdout.trim()) as T;
}
