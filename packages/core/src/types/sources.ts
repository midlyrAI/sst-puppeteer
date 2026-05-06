export interface RawPtyEvent {
  readonly source: 'pty';
  readonly timestamp: number;
  readonly raw: string;
  readonly stripped: string;
}

export interface RawSseEvent {
  readonly source: 'sse';
  readonly timestamp: number;
  readonly eventName: string;
  readonly data: unknown;
}

export interface RawLogLine {
  readonly source: 'log';
  readonly timestamp: number;
  readonly functionName: string;
  readonly line: string;
}

export type RawSourceEvent = RawPtyEvent | RawSseEvent | RawLogLine;
