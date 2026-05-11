import { describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSstConfig } from '../../../src/infra/config/sst-config-parser.js';
import { ConfigNotFoundError } from '../../../src/common/error/errors.js';
import { type Logger } from '../../../src/common/logger/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(): Logger & { warnCalls: string[] } {
  const warnCalls: string[] = [];
  return {
    warnCalls,
    info: vi.fn(),
    warn: (_msg: string) => {
      warnCalls.push(_msg);
    },
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function writeTempConfig(content: string): string {
  const dir = tmpdir();
  const path = join(dir, `sst-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`);
  writeFileSync(path, content, 'utf8');
  return path;
}

// ---------------------------------------------------------------------------
// Test 1: linear declarations
// ---------------------------------------------------------------------------

describe('parseSstConfig', () => {
  it('Test 1: linear declarations — returns 2 CommandSpec entries in order', () => {
    const src = `
export default $config({
  async run() {
    new sst.x.DevCommand("Service-Alpha", {
      dev: {
        command: "node alpha.js",
        directory: "packages/alpha",
      },
    });

    new sst.x.DevCommand('Service-Beta', {
      dev: {
        command: 'node beta.js',
      },
    });
  },
});
`;
    const path = writeTempConfig(src);
    const result = parseSstConfig(path);

    expect(result).toHaveLength(2);

    const alpha = result[0];
    expect(alpha?.name).toBe('Service-Alpha');
    expect(alpha?.command).toBe('node alpha.js');
    expect(alpha?.directory).toBe('packages/alpha');
    expect(alpha?.autostart).toBe(true);
    expect(alpha?.kind).toBe('service');
    expect(alpha?.killable).toBe(true);

    const beta = result[1];
    expect(beta?.name).toBe('Service-Beta');
    expect(beta?.command).toBe('node beta.js');
    expect(beta?.kind).toBe('service');
    expect(beta?.killable).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 2: conditional over-include
  // ---------------------------------------------------------------------------

  it('Test 2: conditional over-include — parser returns BOTH branches of ternary', () => {
    const src = `
const cond = true;
const a = cond ? new sst.x.DevCommand("Cond-A", { dev: { command: "echo a" } }) : null;
const b = cond ? null : new sst.x.DevCommand("Cond-B", { dev: { command: "echo b" } });
`;
    const path = writeTempConfig(src);
    const result = parseSstConfig(path);

    // The parser over-includes: both "Cond-A" and "Cond-B" appear regardless of cond.
    const names = result.map((s) => s.name);
    expect(names).toContain('Cond-A');
    expect(names).toContain('Cond-B');
    expect(result).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Test 3: all fields populated
  // ---------------------------------------------------------------------------

  it('Test 3: all fields populated — name, command, directory, autostart=false, environment, link', () => {
    const src = `
new sst.x.DevCommand("Service-Full", {
  dev: {
    command: "bun run start",
    directory: "packages/full",
    autostart: false,
  },
  environment: {
    NODE_ENV: "development",
    PORT: "3000",
    DEBUG: "true",
  },
  link: [bucket, table],
});
`;
    const path = writeTempConfig(src);
    const result = parseSstConfig(path);

    expect(result).toHaveLength(1);
    const spec = result[0];
    expect(spec?.name).toBe('Service-Full');
    expect(spec?.command).toBe('bun run start');
    expect(spec?.directory).toBe('packages/full');
    expect(spec?.autostart).toBe(false);
    expect(spec?.killable).toBe(true);
    expect(spec?.environment).toBeDefined();
    expect(spec?.environment?.['NODE_ENV']).toBe('development');
    expect(spec?.environment?.['PORT']).toBe('3000');
    expect(spec?.environment?.['DEBUG']).toBe('true');
    expect(spec?.link).toBeDefined();
    expect(spec?.link?.length).toBeGreaterThanOrEqual(2);
    expect(spec?.link).toContain('bucket');
    expect(spec?.link).toContain('table');
  });

  // ---------------------------------------------------------------------------
  // Test 4: missing optional fields → defaults
  // ---------------------------------------------------------------------------

  it('Test 4: missing optional fields — autostart defaults true, no directory, empty env/link', () => {
    const src = `new sst.x.DevCommand("Service-Minimal", { dev: { command: "echo hello" } });`;
    const path = writeTempConfig(src);
    const result = parseSstConfig(path);

    expect(result).toHaveLength(1);
    const spec = result[0];
    expect(spec?.name).toBe('Service-Minimal');
    expect(spec?.command).toBe('echo hello');
    expect(spec?.autostart).toBe(true);
    expect(spec?.directory).toBeUndefined();
    expect(spec?.environment).toBeUndefined();
    expect(spec?.link).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 5: mixed with non-DevCommand resources
  // ---------------------------------------------------------------------------

  it('Test 5: mixed with non-DevCommand resources — only DevCommand entries returned', () => {
    const src = `
const fn = new sst.aws.Function("Foo", { handler: "src/fn.ts" });
const bucket = new sst.aws.Bucket("Bar");

new sst.x.DevCommand("Service-Real", {
  dev: { command: "node real.js" },
  link: [fn, bucket],
});

const table = new sst.aws.Dynamo("MyTable", { fields: { id: "string" }, primaryIndex: { hashKey: "id" } });
`;
    const path = writeTempConfig(src);
    const result = parseSstConfig(path);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Service-Real');
  });

  // ---------------------------------------------------------------------------
  // Test 6: file not found → ConfigNotFoundError
  // ---------------------------------------------------------------------------

  it('Test 6: file not found — throws ConfigNotFoundError with correct configPath', () => {
    const nonExistent = '/nonexistent/path/sst.config.ts';
    expect(() => parseSstConfig(nonExistent)).toThrow(ConfigNotFoundError);

    try {
      parseSstConfig(nonExistent);
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigNotFoundError);
      expect((err as ConfigNotFoundError).configPath).toBe(nonExistent);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 7: malformed declaration recovery
  // ---------------------------------------------------------------------------

  it('Test 7: malformed declaration — recovers valid entry, warns on malformed', () => {
    const src = `
new sst.x.DevCommand("Service-Good", { dev: { command: "echo good" } });
new sst.x.DevCommand("Service-Bad", { dev: { command:
`;
    const path = writeTempConfig(src);
    const logger = makeLogger();
    const result = parseSstConfig(path, { logger });

    // Valid entry is returned
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Service-Good');

    // Logger.warn was called for the malformed entry
    expect(logger.warnCalls.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Test 8: empty file
  // ---------------------------------------------------------------------------

  it('Test 8: empty file — returns []', () => {
    const path = writeTempConfig('');
    const logger = makeLogger();
    const result = parseSstConfig(path, { logger });
    expect(result).toEqual([]);
    expect(logger.warnCalls.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Test 9: kind heuristic
  // ---------------------------------------------------------------------------

  it('Test 9: kind heuristic — Task-*, DB-*, Tunnel-*, others', () => {
    const src = `
new sst.x.DevCommand("Task-Worker", { dev: { command: "node task.js" } });
new sst.x.DevCommand("DB-Postgres", { dev: { command: "node db.js" } });
new sst.x.DevCommand("Tunnel-SSH", { dev: { command: "node tunnel.js" } });
new sst.x.DevCommand("Service-Api", { dev: { command: "node api.js" } });
new sst.x.DevCommand("Frontend-Web", { dev: { command: "node web.js" } });
`;
    const path = writeTempConfig(src);
    const result = parseSstConfig(path);

    expect(result).toHaveLength(5);
    const byName = Object.fromEntries(result.map((s) => [s.name, s.kind]));
    expect(byName['Task-Worker']).toBe('task');
    expect(byName['DB-Postgres']).toBe('tunnel');
    expect(byName['Tunnel-SSH']).toBe('tunnel');
    expect(byName['Service-Api']).toBe('service');
    expect(byName['Frontend-Web']).toBe('service');
  });
});
