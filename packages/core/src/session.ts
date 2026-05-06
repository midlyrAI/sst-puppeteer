import { NotImplementedError } from './errors.js';
import { NoopLogger } from './logger.js';
import {
  type EventHandler,
  type ISession,
  type InvocationResult,
  type Logger,
  type ReadLogsOptions,
  type SessionOptions,
  type Unsubscribe,
  type WaitOptions,
} from './types/session.js';
import { type SessionEvent } from './types/events.js';
import { type DeployState, type FunctionInfo, type InvocationRecord } from './types/state.js';

let _idCounter = 0;
const _generateId = (): string => {
  _idCounter += 1;
  return `sst-session-${Date.now().toString(36)}-${_idCounter.toString(36)}`;
};

export class SSTSession implements ISession {
  readonly id: string;
  readonly projectDir: string;
  protected readonly logger: Logger;
  protected readonly options: SessionOptions;

  constructor(options: SessionOptions) {
    this.id = _generateId();
    this.projectDir = options.projectDir;
    this.logger = options.logger ?? new NoopLogger();
    this.options = options;
  }

  get state(): DeployState {
    throw new NotImplementedError('SSTSession.state');
  }

  async start(): Promise<void> {
    throw new NotImplementedError('SSTSession.start');
  }

  async stop(): Promise<void> {
    throw new NotImplementedError('SSTSession.stop');
  }

  async waitForReady(_opts?: WaitOptions): Promise<{ state: DeployState; durationMs: number }> {
    throw new NotImplementedError('SSTSession.waitForReady');
  }

  async waitForRedeploy(
    _opts?: WaitOptions & { since?: number },
  ): Promise<{ state: DeployState; durationMs: number }> {
    throw new NotImplementedError('SSTSession.waitForRedeploy');
  }

  async invokeFunction(_functionName: string, _payload: unknown): Promise<InvocationResult> {
    throw new NotImplementedError('SSTSession.invokeFunction');
  }

  async readLogs(_opts: ReadLogsOptions): Promise<readonly string[]> {
    throw new NotImplementedError('SSTSession.readLogs');
  }

  listFunctions(): readonly FunctionInfo[] {
    throw new NotImplementedError('SSTSession.listFunctions');
  }

  recentInvocations(_functionName: string, _limit?: number): readonly InvocationRecord[] {
    throw new NotImplementedError('SSTSession.recentInvocations');
  }

  on<T extends SessionEvent['type']>(_type: T, _handler: EventHandler<T>): Unsubscribe {
    throw new NotImplementedError('SSTSession.on');
  }
}
