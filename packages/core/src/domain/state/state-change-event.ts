import { type SessionStateName } from './session-state.js';

export interface StateChangeEvent {
  readonly type: 'state-change';
  readonly timestamp: number;
  readonly from: SessionStateName;
  readonly to: SessionStateName;
}
