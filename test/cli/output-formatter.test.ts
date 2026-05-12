import { describe, expect, it } from 'vitest';
import { formatOutput } from '../../src/cli/output/formatter.js';

describe('cli/output/formatter', () => {
  const data = { a: 1, b: { c: 'x' } };

  it('default JSON mode produces single-line JSON with no trailing newline', () => {
    const out = formatOutput(data);
    expect(out).toBe('{"a":1,"b":{"c":"x"}}');
    expect(out).not.toContain('\n');
  });

  it('pretty mode produces 2-space indented multi-line JSON with no trailing newline', () => {
    const out = formatOutput(data, { pretty: true });
    expect(out).toBe('{\n  "a": 1,\n  "b": {\n    "c": "x"\n  }\n}');
    expect(out.endsWith('\n')).toBe(false);
    expect(out.includes('\n  "a"')).toBe(true);
  });

  it('pretty=false matches default', () => {
    expect(formatOutput(data, { pretty: false })).toBe(formatOutput(data));
  });
});
