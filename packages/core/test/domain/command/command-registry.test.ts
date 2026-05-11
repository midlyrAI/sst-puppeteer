import { describe, expect, it } from 'vitest';
import { CommandRegistry } from '../../../src/domain/command/command-registry.js';
import { CommandNotFoundError } from '../../../src/common/error/errors.js';
import { type CommandSpec } from '../../../src/common/contract/command.js';

function makeSpec(name: string, overrides?: Partial<CommandSpec>): CommandSpec {
  return {
    name,
    kind: 'service',
    command: `start-${name}`,
    autostart: true,
    killable: true,
    ...overrides,
  };
}

describe('CommandRegistry', () => {
  it('Test 1: register(spec) adds a Command with status idle', () => {
    const registry = new CommandRegistry();
    registry.register(makeSpec('web'));
    const cmd = registry.get('web');
    expect(cmd).toBeDefined();
    expect(cmd?.status).toBe('idle');
    expect(cmd?.spec.name).toBe('web');
  });

  it('Test 2: register twice with same name replaces the first', () => {
    const registry = new CommandRegistry();
    registry.register(makeSpec('web', { command: 'first' }));
    registry.register(makeSpec('web', { command: 'second' }));
    const cmd = registry.get('web');
    expect(cmd?.spec.command).toBe('second');
    expect(registry.list()).toHaveLength(1);
  });

  it('Test 3: applyStatus updates status', () => {
    const registry = new CommandRegistry();
    registry.register(makeSpec('web'));
    registry.applyStatus('web', 'running');
    expect(registry.get('web')?.status).toBe('running');
  });

  it('Test 4: applyStatus on unknown name throws CommandNotFoundError', () => {
    const registry = new CommandRegistry();
    expect(() => registry.applyStatus('unknown', 'running')).toThrow(CommandNotFoundError);
  });

  it('Test 5: applyStatus to current state is a no-op (no handlers fire)', () => {
    const registry = new CommandRegistry();
    registry.register(makeSpec('web'));
    let count = 0;
    registry.onChange(() => {
      count++;
    });
    registry.applyStatus('web', 'idle'); // already idle
    expect(count).toBe(0);
  });

  it('Test 6: onChange handler fires exactly once per non-noop transition; unsubscribe works', () => {
    const registry = new CommandRegistry();
    registry.register(makeSpec('web'));
    let count = 0;
    const unsub = registry.onChange(() => {
      count++;
    });

    registry.applyStatus('web', 'starting');
    registry.applyStatus('web', 'running');
    expect(count).toBe(2);

    unsub();
    registry.applyStatus('web', 'stopped');
    expect(count).toBe(2);
  });

  it('Test 7: waitForStatus resolves when applyStatus is called', async () => {
    const registry = new CommandRegistry();
    registry.register(makeSpec('web'));
    const p = registry.waitForStatus('web', 'running');
    registry.applyStatus('web', 'running');
    await expect(p).resolves.toBeUndefined();
  });

  it('Test 8: waitForStatus rejects with timeout Error if no transition happens', async () => {
    const registry = new CommandRegistry();
    registry.register(makeSpec('web'));
    await expect(registry.waitForStatus('web', 'running', 50)).rejects.toThrow(Error);
    await expect(registry.waitForStatus('web', 'starting', 50)).rejects.toThrow(/Timed out/);
  });

  it('Test 9: waitForStatus resolves immediately if already at target', async () => {
    const registry = new CommandRegistry();
    registry.register(makeSpec('web'));
    registry.applyStatus('web', 'running');
    await expect(registry.waitForStatus('web', 'running')).resolves.toBeUndefined();
  });

  it('Test 10: waitForStatus on unknown name throws CommandNotFoundError', () => {
    const registry = new CommandRegistry();
    expect(() => registry.waitForStatus('unknown', 'running')).toThrow(CommandNotFoundError);
  });

  it('Test 11: applyStatus to starting sets startedAt; stopped clears it; lastExit is recorded', () => {
    const registry = new CommandRegistry();
    registry.register(makeSpec('web'));

    registry.applyStatus('web', 'starting');
    const startedAt = registry.get('web')?.startedAt;
    expect(startedAt).toBeTypeOf('number');

    registry.applyStatus('web', 'stopped', { code: 0, signal: null });
    const stopped = registry.get('web');
    expect(stopped?.startedAt).toBeUndefined();
    expect(stopped?.lastExit).toEqual({ code: 0, signal: null });
  });

  it('Test 12: list() returns all registered commands', () => {
    const registry = new CommandRegistry();
    registry.register(makeSpec('web'));
    registry.register(makeSpec('api'));
    registry.register(makeSpec('worker'));
    const all = registry.list();
    expect(all).toHaveLength(3);
    const names = all.map((c) => c.spec.name);
    expect(names).toContain('web');
    expect(names).toContain('api');
    expect(names).toContain('worker');
  });
});
