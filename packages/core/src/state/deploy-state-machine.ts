import { NotImplementedError } from '../errors.js';
import { type DeployState } from '../types/state.js';
import { type SessionEvent } from '../types/events.js';

export type DeployStateChangeHandler = (from: DeployState, to: DeployState) => void;

export class DeployStateMachine {
  private _current: DeployState = 'idle';

  get current(): DeployState {
    return this._current;
  }

  transition(_event: SessionEvent): void {
    throw new NotImplementedError('DeployStateMachine.transition');
  }

  waitFor(_target: DeployState, _timeoutMs?: number): Promise<void> {
    throw new NotImplementedError('DeployStateMachine.waitFor');
  }

  onChange(_handler: DeployStateChangeHandler): () => void {
    throw new NotImplementedError('DeployStateMachine.onChange');
  }
}
