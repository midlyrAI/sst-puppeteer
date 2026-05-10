export type CommandKind = 'service' | 'task' | 'tunnel' | 'function-host';

export type CommandStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'errored';

export interface CommandSpec {
  readonly name: string;
  readonly kind: CommandKind;
  readonly command: string;
  readonly directory?: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly autostart: boolean;
  readonly link?: readonly string[];
  readonly killable: boolean;
}

export interface CommandLastExit {
  readonly code: number | null;
  readonly signal: number | null;
}

export interface Command {
  readonly spec: CommandSpec;
  readonly status: CommandStatus;
  readonly lastExit?: CommandLastExit;
  readonly startedAt?: number;
}
