import { NotImplementedError } from '../errors.js';
import { type FunctionInfo, type ResourceGraphSnapshot } from '../types/state.js';
import { type SessionEvent } from '../types/events.js';

export class ResourceGraph {
  apply(_event: SessionEvent): void {
    throw new NotImplementedError('ResourceGraph.apply');
  }

  getFunction(_name: string): FunctionInfo | undefined {
    throw new NotImplementedError('ResourceGraph.getFunction');
  }

  list(): readonly FunctionInfo[] {
    throw new NotImplementedError('ResourceGraph.list');
  }

  snapshot(): ResourceGraphSnapshot {
    throw new NotImplementedError('ResourceGraph.snapshot');
  }
}
