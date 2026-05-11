import { type SessionState } from './session-state.js';

export interface StateChangeEvent {
  readonly type: 'state-change';
  readonly timestamp: number;
  readonly from: SessionState;
  readonly to: SessionState;
}
