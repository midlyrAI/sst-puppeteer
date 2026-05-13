import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the core runSst function before importing the command.
vi.mock('../../shared/src/core/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    runSst: vi.fn(),
  };
});

import { runSst } from '../../shared/src/core/index.js';
import { RunSstCommand } from '../src/commands/run-sst-command.js';

const makeWritable = (): { stream: Writable; data: () => string } => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, data: () => chunks.join('') };
};

const makeCtx = (stdout: Writable, stderr: Writable, cwd = '/tmp/proj') => ({
  stdout,
  stderr,
  cwd,
});

describe('run-sst', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('run-sst > invokes core runSst() and bypasses daemon entirely', async () => {
    const mockResult = {
      stdout: 'deploy ok',
      stderr: '',
      exitCode: 0,
      signal: null,
      durationMs: 1234,
      timedOut: false,
    };
    vi.mocked(runSst).mockResolvedValue(mockResult);

    const cmd = new RunSstCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(
      ['--project', '/my/app', '--stage', 'prod', '--', 'deploy'],
      makeCtx(out.stream, err.stream),
    );

    expect(code).toBe(0);
    expect(runSst).toHaveBeenCalledOnce();
    expect(runSst).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDir: '/my/app',
        stage: 'prod',
        args: ['deploy'],
      }),
    );
    const parsed = JSON.parse(out.data().trim());
    expect(parsed.stdout).toBe('deploy ok');
    expect(parsed.exitCode).toBe(0);
  });

  it('run-sst > passes multiple args after -- separator', async () => {
    const mockResult = {
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      durationMs: 500,
      timedOut: false,
    };
    vi.mocked(runSst).mockResolvedValue(mockResult);

    const cmd = new RunSstCommand();
    const out = makeWritable();
    const err = makeWritable();
    await cmd.execute(
      ['--', 'deploy', '--stage', 'dev', '--verbose'],
      makeCtx(out.stream, err.stream, '/cwd'),
    );

    expect(runSst).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['deploy', '--stage', 'dev', '--verbose'],
        projectDir: '/cwd',
      }),
    );
  });

  it('run-sst > non-zero exit still prints result to stdout and returns exit code 1', async () => {
    const mockResult = {
      stdout: 'partial output',
      stderr: 'some error',
      exitCode: 1,
      signal: null,
      durationMs: 300,
      timedOut: false,
    };
    vi.mocked(runSst).mockResolvedValue(mockResult);

    const cmd = new RunSstCommand();
    const out = makeWritable();
    const err = makeWritable();
    const code = await cmd.execute(['--', 'deploy'], makeCtx(out.stream, err.stream, '/proj'));

    expect(code).toBe(1);
    // Result still printed to stdout.
    const parsed = JSON.parse(out.data().trim());
    expect(parsed.exitCode).toBe(1);
    expect(parsed.stdout).toBe('partial output');
    // Nothing written to stderr (error output is from sst, already captured in result).
    expect(err.data()).toBe('');
  });

  it('run-sst > project defaults to cwd when --project not provided', async () => {
    const mockResult = {
      stdout: '',
      stderr: '',
      exitCode: 0,
      signal: null,
      durationMs: 100,
      timedOut: false,
    };
    vi.mocked(runSst).mockResolvedValue(mockResult);

    const cmd = new RunSstCommand();
    const out = makeWritable();
    const err = makeWritable();
    await cmd.execute(['--', 'unlock'], makeCtx(out.stream, err.stream, '/my/cwd'));

    expect(runSst).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDir: '/my/cwd',
        args: ['unlock'],
      }),
    );
  });
});
