import { describe, expect, it } from 'vitest';
import { DeployStateMachine } from '../../src/domain/deploy-state-machine.js';
import { DeployFailedError } from '../../src/errors.js';
import type { StateChangeEvent } from '../../src/domain/session-event.js';

function makeStateChange(
  from: StateChangeEvent['from'],
  to: StateChangeEvent['to'],
): StateChangeEvent {
  return { type: 'state-change', timestamp: Date.now(), from, to };
}

describe('DeployStateMachine', () => {
  it('Test 1: initial state is idle', () => {
    const sm = new DeployStateMachine();
    expect(sm.current).toBe('idle');
  });

  it('Test 2: transition state-change idle→deploying', () => {
    const sm = new DeployStateMachine();
    sm.transition(makeStateChange('idle', 'deploying'));
    expect(sm.current).toBe('deploying');
  });

  it('Test 3: full happy path idle→deploying→ready with waitFor resolving', async () => {
    const sm = new DeployStateMachine();
    sm.transition(makeStateChange('idle', 'deploying'));

    const p = sm.waitFor('ready');
    sm.transition(makeStateChange('deploying', 'ready'));

    await expect(p).resolves.toBeUndefined();
    expect(sm.current).toBe('ready');
  });

  it('Test 4: waitFor resolves immediately when already in target state', async () => {
    const sm = new DeployStateMachine();
    sm.transition(makeStateChange('idle', 'ready'));
    await expect(sm.waitFor('ready')).resolves.toBeUndefined();
  });

  it('Test 5: waitFor rejects with DeployFailedError after timeout', async () => {
    const sm = new DeployStateMachine();
    await expect(sm.waitFor('ready', 50)).rejects.toBeInstanceOf(DeployFailedError);
  });

  it('Test 6: waitFor(ready) rejects with DeployFailedError on errored transition', async () => {
    const sm = new DeployStateMachine();
    sm.transition(makeStateChange('idle', 'deploying'));

    const p = sm.waitFor('ready');
    sm.transition(makeStateChange('deploying', 'error'));

    await expect(p).rejects.toBeInstanceOf(DeployFailedError);
  });

  it('Test 7: onChange handler fires exactly once per transition', () => {
    const sm = new DeployStateMachine();
    let count = 0;
    sm.onChange(() => {
      count++;
    });

    sm.transition(makeStateChange('idle', 'deploying'));
    sm.transition(makeStateChange('deploying', 'ready'));

    expect(count).toBe(2);
  });

  it('Test 8: onChange unsubscribe stops handler from firing', () => {
    const sm = new DeployStateMachine();
    let count = 0;
    const unsub = sm.onChange(() => {
      count++;
    });

    sm.transition(makeStateChange('idle', 'deploying'));
    sm.transition(makeStateChange('deploying', 'ready'));
    // count is 2 here

    unsub();
    // transition again after unsubscribe — count should not increase
    sm.transition(makeStateChange('ready', 'error'));

    expect(count).toBe(2);
  });
});
