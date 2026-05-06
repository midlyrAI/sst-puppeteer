import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { CliRunner, defaultRegistry } from '../src/index.js';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

const collectTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
};

const drain = (stream: PassThrough): string => {
  const chunks: Buffer[] = [];
  let chunk: Buffer | string | null;
  while ((chunk = stream.read()) !== null) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
};

describe('CLI smoke', () => {
  const buildRunner = (): {
    runner: CliRunner;
    stdout: PassThrough;
    stderr: PassThrough;
  } => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const runner = new CliRunner({
      registry: defaultRegistry(),
      ctx: { stdout, stderr, cwd: '/tmp' },
    });
    return { runner, stdout, stderr };
  };

  it('"version" command exits 0 and writes a semver to stdout', async () => {
    const { runner, stdout } = buildRunner();
    const code = await runner.run(['node', 'bin', 'version']);
    expect(code).toBe(0);
    expect(drain(stdout)).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('unknown command exits 2 and writes usage to stderr', async () => {
    const { runner, stderr } = buildRunner();
    const code = await runner.run(['node', 'bin', 'nope']);
    expect(code).toBe(2);
    const err = drain(stderr);
    expect(err).toContain('Unknown command');
    expect(err).toContain('Usage');
  });

  it('no command exits 2 with usage', async () => {
    const { runner, stderr } = buildRunner();
    const code = await runner.run(['node', 'bin']);
    expect(code).toBe(2);
    expect(drain(stderr)).toContain('Usage');
  });
});

describe('cli isolation (no @sst-puppeteer/mcp imports)', () => {
  it('no source file imports @sst-puppeteer/mcp', () => {
    const offenders = collectTsFiles(SRC_DIR).filter((file) =>
      /@sst-puppeteer\/mcp/.test(readFileSync(file, 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });
});
