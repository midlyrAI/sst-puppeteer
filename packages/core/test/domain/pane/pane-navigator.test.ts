import { describe, expect, it } from 'vitest';
import { PaneNavigator } from '../../../src/domain/pane/pane-navigator.js';
import { CommandRegistry } from '../../../src/domain/command/command-registry.js';
import { CommandNotFoundError } from '../../../src/common/error/errors.js';
import { KEY } from '../../../src/common/keystroke/keystroke-encoder.js';
import {
  type Pty,
  type PtyDataHandler,
  type PtyExitHandler,
  type PtySpawnOptions,
  type PtyUnsubscribe,
} from '../../../src/infra/pty/node-pty-adapter.js';
import { type CommandSpec } from '../../../src/common/contract/command.js';

// ---------------------------------------------------------------------------
// Mock adapter — records every write() call
// ---------------------------------------------------------------------------
class MockPty implements Pty {
  readonly pid: number | null = 12345;
  readonly _writeCalls: string[] = [];

  spawn(_opts: PtySpawnOptions): Promise<void> {
    return Promise.resolve();
  }

  write(data: string): void {
    this._writeCalls.push(data);
  }

  onData(_handler: PtyDataHandler): PtyUnsubscribe {
    return () => {};
  }

  onExit(_handler: PtyExitHandler): PtyUnsubscribe {
    return () => {};
  }

  resize(_cols: number, _rows: number): void {
    // no-op
  }

  kill(_signal?: string): void {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function makeNavigator(
  reg: CommandRegistry,
  settleMs = 0,
): { nav: PaneNavigator; adapter: MockPty } {
  const adapter = new MockPty();
  const nav = new PaneNavigator({ adapter, commandRegistry: reg, settleMs });
  return { nav, adapter };
}

// ---------------------------------------------------------------------------
// Access _localSortOrder() via cast for whitebox tests.
// We cast through unknown to avoid TS intersection issues with private members.
// ---------------------------------------------------------------------------
interface NavPrivateAccess {
  _localSortOrder(): readonly {
    name: string;
    killable: boolean;
    alive: boolean;
    isSystem: boolean;
  }[];
  _findIndexByName(name: string): number;
  _currentIndex: number;
}

function asPrivate(nav: PaneNavigator): NavPrivateAccess {
  return nav as unknown as NavPrivateAccess;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('PaneNavigator — _localSortOrder', () => {
  it('Test 1: empty registry — returns SST and Functions system panes only', () => {
    const reg = new CommandRegistry();
    const { nav } = makeNavigator(reg);
    const order = asPrivate(nav)._localSortOrder();
    expect(order.map((t) => t.name)).toEqual(['SST', 'Functions']);
  });

  it('Test 2: one running service — system panes first, then user command', () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('MyService'));
    reg.applyStatus('MyService', 'running');
    const { nav } = makeNavigator(reg);
    const names = asPrivate(nav)
      ._localSortOrder()
      .map((t) => t.name);
    expect(names[0]).toBe('SST');
    expect(names[1]).toBe('Functions');
    expect(names[2]).toBe('MyService');
  });

  it('Test 3: setSystemPanes({hasTasks:true}) adds Tasks system pane', () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('RunMigration'));
    const { nav } = makeNavigator(reg);
    nav.setSystemPanes({ hasTasks: true });
    const names = asPrivate(nav)
      ._localSortOrder()
      .map((t) => t.name);
    expect(names).toContain('Tasks');
    expect(names).toContain('SST');
    expect(names).toContain('Functions');
  });

  it('Test 4: setSystemPanes({hasTunnel:true}) adds Tunnel system pane', () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('DbTunnel'));
    const { nav } = makeNavigator(reg);
    nav.setSystemPanes({ hasTunnel: true });
    const names = asPrivate(nav)
      ._localSortOrder()
      .map((t) => t.name);
    expect(names).toContain('Tunnel');
  });

  it('Test 4b: kind alone does NOT add system panes (no heuristic)', () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('Task-X', { kind: 'task' }));
    reg.register(makeSpec('Tunnel-Y', { kind: 'tunnel' }));
    const { nav } = makeNavigator(reg);
    const names = asPrivate(nav)
      ._localSortOrder()
      .map((t) => t.name);
    expect(names).not.toContain('Tasks');
    expect(names).not.toContain('Tunnel');
  });

  it('Test 5: tiebreak by name length — shorter name comes first among same killable+alive group', () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('BB'));
    reg.register(makeSpec('A'));
    reg.applyStatus('BB', 'running');
    reg.applyStatus('A', 'running');
    const { nav } = makeNavigator(reg);
    const order = asPrivate(nav)._localSortOrder();
    const userPanes = order.filter(
      (t) => !t.killable === false && !['SST', 'Functions'].includes(t.name),
    );
    const userNames = userPanes.map((t) => t.name);
    // 'A' (length 1) should sort before 'BB' (length 2)
    expect(userNames.indexOf('A')).toBeLessThan(userNames.indexOf('BB'));
  });

  it('Test 6: alive before dead within same killable group', () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('Alpha'));
    reg.register(makeSpec('Beta'));
    reg.applyStatus('Alpha', 'stopped');
    reg.applyStatus('Beta', 'running');
    const { nav } = makeNavigator(reg);
    const order = asPrivate(nav)._localSortOrder();
    const betaIdx = order.findIndex((t) => t.name === 'Beta');
    const alphaIdx = order.findIndex((t) => t.name === 'Alpha');
    expect(betaIdx).toBeLessThan(alphaIdx);
  });
});

describe('PaneNavigator — _findIndexByName', () => {
  it('Test 7: throws CommandNotFoundError for unknown name', () => {
    const reg = new CommandRegistry();
    const { nav } = makeNavigator(reg);
    expect(() => asPrivate(nav)._findIndexByName('Unknown')).toThrow(CommandNotFoundError);
  });

  it('Test 8: throws CommandNotFoundError for system pane names', () => {
    const reg = new CommandRegistry();
    const { nav } = makeNavigator(reg);
    expect(() => asPrivate(nav)._findIndexByName('SST')).toThrow(CommandNotFoundError);
    expect(() => asPrivate(nav)._findIndexByName('Functions')).toThrow(CommandNotFoundError);
  });

  it('Test 9: returns correct index for a known DevCommand (accounting for system pane offsets)', () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('MyService'));
    reg.applyStatus('MyService', 'running');
    const { nav } = makeNavigator(reg);
    // SST=0, Functions=1, MyService=2
    const idx = asPrivate(nav)._findIndexByName('MyService');
    expect(idx).toBe(2);
  });
});

describe('PaneNavigator — navigateTo keystrokes', () => {
  it('Test 10: anchors at top with N keyK presses then walks down to target', async () => {
    const reg = new CommandRegistry();
    for (const name of ['Svc1', 'Svc22', 'Svc333', 'Svc4444']) {
      reg.register(makeSpec(name));
      reg.applyStatus(name, 'running');
    }
    // sort order: SST(0) Functions(1) Svc1(2) Svc22(3) Svc333(4) Svc4444(5) — 6 panes
    const { nav, adapter } = makeNavigator(reg, 0);
    await nav.navigateTo('Svc22'); // target index 3

    const kPresses = adapter._writeCalls.filter((c) => c === KEY.keyK);
    const jPresses = adapter._writeCalls.filter((c) => c === KEY.keyJ);
    expect(kPresses).toHaveLength(6); // anchor: one k per pane
    expect(jPresses).toHaveLength(3); // walk down to index 3
    expect(nav.currentIndex).toBe(3);
  });

  it('Test 11: target index 0 sends only the anchor (no down-walk)', async () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('Svc1'));
    reg.applyStatus('Svc1', 'running');
    const { nav, adapter } = makeNavigator(reg, 0);
    asPrivate(nav)._currentIndex = 2; // Svc1 is at 2 — but we still anchor first
    await nav.navigateTo('Svc1');

    const kPresses = adapter._writeCalls.filter((c) => c === KEY.keyK);
    const jPresses = adapter._writeCalls.filter((c) => c === KEY.keyJ);
    // 3 panes total (SST, Functions, Svc1); target at index 2
    expect(kPresses).toHaveLength(3);
    expect(jPresses).toHaveLength(2);
    expect(nav.currentIndex).toBe(2);
  });

  it('Test 12: navigation order is anchor-first, walk-second', async () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('Alpha'));
    reg.applyStatus('Alpha', 'running');
    const { nav, adapter } = makeNavigator(reg, 0);
    await nav.navigateTo('Alpha'); // index 2

    // Should see: keyK keyK keyK keyJ keyJ
    expect(adapter._writeCalls).toEqual([KEY.keyK, KEY.keyK, KEY.keyK, KEY.keyJ, KEY.keyJ]);
  });

  it('Test 13: after navigateTo, currentIndex is updated', async () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('Alpha'));
    reg.applyStatus('Alpha', 'running');
    const { nav } = makeNavigator(reg, 0);
    await nav.navigateTo('Alpha'); // index 2
    expect(nav.currentIndex).toBe(2);
  });
});

describe('PaneNavigator — re-derivation after status change', () => {
  it('Test 14: navigation lands at the new index when sort reorders', async () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('Alpha')); // 5 chars
    reg.register(makeSpec('Beta')); // 4 chars
    reg.applyStatus('Alpha', 'running');
    reg.applyStatus('Beta', 'running');
    // Initial order: SST(0) Functions(1) Beta(2) Alpha(3)
    const { nav, adapter } = makeNavigator(reg, 0);

    await nav.navigateTo('Alpha');
    expect(nav.currentIndex).toBe(3);
    adapter._writeCalls.length = 0;

    reg.applyStatus('Beta', 'stopped');
    nav.noteStatusChange();
    // New order: SST(0) Functions(1) Alpha(2) Beta(3)

    await nav.navigateTo('Alpha');
    expect(nav.currentIndex).toBe(2);
    // Anchor: 4 panes → 4 keyK; walk: index 2 → 2 keyJ
    expect(adapter._writeCalls.filter((c) => c === KEY.keyK)).toHaveLength(4);
    expect(adapter._writeCalls.filter((c) => c === KEY.keyJ)).toHaveLength(2);
  });

  it('Test 14b: navigation is drift-proof — wrong _currentIndex still lands correctly', async () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('Svc1'));
    reg.applyStatus('Svc1', 'running');
    const { nav, adapter } = makeNavigator(reg, 0);

    // Simulate cursor drift: our internal index says 99, but anchor-and-walk
    // ignores it. Final position should still be the target.
    asPrivate(nav)._currentIndex = 99;
    await nav.navigateTo('Svc1'); // Svc1 is at 2

    expect(nav.currentIndex).toBe(2);
    expect(adapter._writeCalls.filter((c) => c === KEY.keyK)).toHaveLength(3);
    expect(adapter._writeCalls.filter((c) => c === KEY.keyJ)).toHaveLength(2);
  });
});

describe('PaneNavigator — resync', () => {
  it('Test 15: resync() resets currentIndex to 0', async () => {
    const reg = new CommandRegistry();
    reg.register(makeSpec('MyService'));
    reg.applyStatus('MyService', 'running');
    const { nav } = makeNavigator(reg, 0);
    await nav.navigateTo('MyService'); // moves to index 2
    expect(nav.currentIndex).toBe(2);
    nav.resync();
    expect(nav.currentIndex).toBe(0);
  });
});

describe('PaneNavigator — settle delay', () => {
  it('Test 16: with settleMs=50, two keystrokes take ≥50ms', async () => {
    const reg = new CommandRegistry();
    for (const name of ['Svc1', 'Svc22', 'Svc333']) {
      reg.register(makeSpec(name));
      reg.applyStatus(name, 'running');
    }
    // Svc1 is at index 2, so navigating from 0 takes 2 j-presses
    const { nav } = makeNavigator(reg, 50);
    const before = Date.now();
    await nav.navigateTo('Svc1'); // 2 keystrokes × 50ms = ≥50ms
    const elapsed = Date.now() - before;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  }, 5000);
});
