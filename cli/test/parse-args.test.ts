// Test #29 — parse-args edge cases
// Tests util.parseArgs usage patterns used by CLI commands, plus the
// thin parseCliArgs helper in src/cli/args/parse-args.ts.

import { parseArgs } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../src/args/parse-args.js';

describe('parse-args edge cases', () => {
  it('--key=value form parses identically to --key value', () => {
    const withEquals = parseArgs({
      args: ['--stage=dev'],
      options: { stage: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    });
    const withSpace = parseArgs({
      args: ['--stage', 'dev'],
      options: { stage: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    });
    expect(withEquals.values['stage']).toBe('dev');
    expect(withSpace.values['stage']).toBe('dev');
    expect(withEquals.values).toEqual(withSpace.values);
  });

  it('boolean flag without argument works', () => {
    const result = parseArgs({
      args: ['--pretty'],
      options: { pretty: { type: 'boolean', default: false } },
      strict: true,
      allowPositionals: false,
    });
    expect(result.values['pretty']).toBe(true);
  });

  it('numeric option string can be converted to number after parsing', () => {
    const result = parseArgs({
      args: ['--timeout', '5000'],
      options: { timeout: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    });
    const timeoutMs = Number(result.values['timeout']);
    expect(timeoutMs).toBe(5000);
    expect(Number.isFinite(timeoutMs)).toBe(true);
  });

  it('strict:true rejects unknown options', () => {
    expect(() =>
      parseArgs({
        args: ['--unknown-flag'],
        options: { known: { type: 'boolean' } },
        strict: true,
        allowPositionals: false,
      }),
    ).toThrow();
  });

  it('allowPositionals:true lets positional args through', () => {
    const result = parseArgs({
      args: ['/tmp/myproject', '--stage', 'prod'],
      options: { stage: { type: 'string' } },
      strict: true,
      allowPositionals: true,
    });
    expect(result.positionals).toEqual(['/tmp/myproject']);
    expect(result.values['stage']).toBe('prod');
  });

  describe('parseCliArgs helper', () => {
    it('uses strict:true and allowPositionals:true by default', () => {
      const result = parseCliArgs(['/tmp/p', '--stage', 'test'], {
        options: { stage: { type: 'string' } },
      });
      expect(result.positionals).toEqual(['/tmp/p']);
      expect(result.values['stage']).toBe('test');
    });

    it('rejects unknown flags with default strict mode', () => {
      expect(() =>
        parseCliArgs(['--totally-unknown'], {
          options: { known: { type: 'boolean' } },
        }),
      ).toThrow();
    });

    it('caller can override allowPositionals to false', () => {
      const result = parseCliArgs(['--pretty'], {
        options: { pretty: { type: 'boolean', default: false } },
        allowPositionals: false,
      });
      expect(result.values['pretty']).toBe(true);
    });
  });
});
