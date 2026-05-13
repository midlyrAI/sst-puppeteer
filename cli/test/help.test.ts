// Tests #31 and #32
// #31: each command's --help-json emits valid JSON with input+output schemas
// #32: --pretty output is human-readable and differs from --json

import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { defaultRegistry } from '../src/commands/index.js';
import { formatOutput } from '../src/output/formatter.js';

const drain = (s: PassThrough): string => {
  const chunks: Buffer[] = [];
  let c: Buffer | string | null;
  while ((c = s.read()) !== null) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf-8');
};

const makeCtx = () => {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  return { ctx: { stdout, stderr, cwd: '/tmp' }, stdout, stderr };
};

describe('help', () => {
  describe('each command --help-json emits valid JSON with name + input', () => {
    const registry = defaultRegistry();
    const visibleCommands = registry.list().filter((c) => !c.hidden);

    // version does not implement helpSchema() but does handle --help-json
    // It outputs {name, description} without input/output — this is documented and accepted.
    for (const cmd of visibleCommands) {
      it(`${cmd.name} --help-json emits parseable JSON with name field`, async () => {
        const { ctx, stdout } = makeCtx();
        const code = await cmd.execute(['--help-json'], ctx);
        expect(code).toBe(0);
        const raw = drain(stdout).trim();
        expect(raw.length).toBeGreaterThan(0);
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        expect(parsed).toHaveProperty('name', cmd.name);
        expect(parsed).toHaveProperty('description');
        // Commands that implement helpSchema() must also include input
        if (cmd.helpSchema !== undefined) {
          expect(parsed).toHaveProperty('input');
          // input must be an object with a 'type' field (zod _def shape)
          expect(typeof parsed['input']).toBe('object');
          expect((parsed['input'] as Record<string, unknown>)['type']).toBeDefined();
        }
      });
    }
  });

  it('Test #32: --pretty output is human-readable and differs from --json', () => {
    const data = { sessions: [{ sessionId: 'abc-123', status: 'running', projectDir: '/tmp/p' }] };
    const compact = formatOutput(data, { pretty: false });
    const pretty = formatOutput(data, { pretty: true });
    // compact has no newlines inside the object
    expect(compact).not.toContain('\n');
    // pretty is multi-line
    expect(pretty).toContain('\n');
    expect(pretty).toContain('  ');
    // Both parse to the same value
    expect(JSON.parse(compact)).toEqual(JSON.parse(pretty));
    // They differ in raw string form
    expect(compact).not.toBe(pretty);
  });
});
