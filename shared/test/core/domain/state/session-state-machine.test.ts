import { describe, expect, it } from 'vitest';
import { SessionStateMachine } from '../../../../src/core/domain/state/session-state-machine.js';
import { UpdateFailedError } from '../../../../src/core/common/error/errors.js';
import type { StateChangeEvent } from '../../../../src/core/domain/session/session-event.js';

function makeStateChange(
  from: StateChangeEvent['from'],
  to: StateChangeEvent['to'],
): StateChangeEvent {
  return { type: 'state-change', timestamp: Date.now(), from, to };
}

describe('SessionStateMachine', () => {
  it('Test 1: initial state is idle', () => {
    const sm = new SessionStateMachine();
    expect(sm.current).toBe('idle');
  });

  it('Test 2: transition state-change idle→busy', () => {
    const sm = new SessionStateMachine();
    sm.transition(makeStateChange('idle', 'busy'));
    expect(sm.current).toBe('busy');
  });

  it('Test 3: full happy path idle→busy→ready with waitFor resolving', async () => {
    const sm = new SessionStateMachine();
    sm.transition(makeStateChange('idle', 'busy'));

    const p = sm.waitFor('ready');
    sm.transition(makeStateChange('busy', 'ready'));

    await expect(p).resolves.toBeUndefined();
    expect(sm.current).toBe('ready');
  });

  it('Test 4: waitFor resolves immediately when already in target state', async () => {
    const sm = new SessionStateMachine();
    sm.transition(makeStateChange('idle', 'ready'));
    await expect(sm.waitFor('ready')).resolves.toBeUndefined();
  });

  it('Test 5: waitFor rejects with UpdateFailedError after timeout', async () => {
    const sm = new SessionStateMachine();
    await expect(sm.waitFor('ready', 50)).rejects.toBeInstanceOf(UpdateFailedError);
  });

  it('Test 6: waitFor(ready) rejects with UpdateFailedError on errored transition', async () => {
    const sm = new SessionStateMachine();
    sm.transition(makeStateChange('idle', 'busy'));

    const p = sm.waitFor('ready');
    sm.transition(makeStateChange('busy', 'error'));

    await expect(p).rejects.toBeInstanceOf(UpdateFailedError);
  });

  it('Test 7: onChange handler fires exactly once per transition', () => {
    const sm = new SessionStateMachine();
    let count = 0;
    sm.onChange(() => {
      count++;
    });

    sm.transition(makeStateChange('idle', 'busy'));
    sm.transition(makeStateChange('busy', 'ready'));

    expect(count).toBe(2);
  });

  it('Test 8: onChange unsubscribe stops handler from firing', () => {
    const sm = new SessionStateMachine();
    let count = 0;
    const unsub = sm.onChange(() => {
      count++;
    });

    sm.transition(makeStateChange('idle', 'busy'));
    sm.transition(makeStateChange('busy', 'ready'));
    // count is 2 here

    unsub();
    // transition again after unsubscribe — count should not increase
    sm.transition(makeStateChange('ready', 'error'));

    expect(count).toBe(2);
  });
});
