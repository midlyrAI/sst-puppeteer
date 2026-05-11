export interface LogLineEvent {
  readonly type: 'log-line';
  readonly timestamp: number;
  readonly functionName: string;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
  readonly requestId?: string;
}
