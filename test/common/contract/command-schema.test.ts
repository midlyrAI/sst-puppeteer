import { describe, expect, it } from 'vitest';
import { CommandSpecSchema, CommandSchema } from '../../../src/core/index.js';

describe('CommandSpecSchema', () => {
  it('accepts null for environment (SST omits env vars as null, not undefined)', () => {
    const parsed = CommandSpecSchema.parse({
      name: 'api',
      kind: 'service',
      command: 'bun run dev',
      directory: null,
      environment: null,
      autostart: true,
      link: null,
      killable: true,
    });
    expect(parsed.environment).toBeNull();
    expect(parsed.directory).toBeNull();
    expect(parsed.link).toBeNull();
  });

  it('still accepts populated environment', () => {
    const parsed = CommandSpecSchema.parse({
      name: 'api',
      kind: 'service',
      command: 'bun run dev',
      environment: { PORT: '3000' },
      autostart: true,
      killable: true,
    });
    expect(parsed.environment).toEqual({ PORT: '3000' });
  });

  it('full CommandSchema parses a real-shaped pane with null env', () => {
    const parsed = CommandSchema.parse({
      spec: {
        name: 'web',
        kind: 'service',
        command: 'bun run dev',
        directory: null,
        environment: null,
        autostart: true,
        link: null,
        killable: true,
      },
      status: 'running',
      startedAt: 1700000000000,
    });
    expect(parsed.status).toBe('running');
    expect(parsed.spec.environment).toBeNull();
  });
});
