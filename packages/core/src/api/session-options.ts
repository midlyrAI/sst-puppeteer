import { type CommandSpec } from '../domain/command.js';
import { type SstBusEvent } from '../domain/sst-bus-event.js';
import { type EventStream } from '../transport/event-stream.js';
import { type PaneLogWatcher } from '../transport/pane-log-watcher.js';
import { type Logger } from './logger.js';
import { type PtyAdapter } from './pty-adapter.js';

export interface SessionOptions {
  /** PTY adapter. Defaults to a fresh `NodePtyAdapter` when constructed via `SessionBuilder`. */
  readonly adapter?: PtyAdapter;
  readonly projectDir: string;
  readonly logger?: Logger;
  readonly awsProfile?: string;
  readonly awsRegion?: string;
  /**
   * SST stage name (passed as `--stage <stage>` to `sst dev`). When undefined,
   * SST uses its default stage (typically the user's username or whatever
   * `sst.config.ts` sets).
   */
  readonly stage?: string;
  /**
   * Executable used to spawn the SST CLI. Defaults to `'sst'`. Set to `'bunx'`
   * (with `sstCommandArgs: ['sst']`) when SST is not on the host PATH but is
   * resolvable via Bun's package cache.
   */
  readonly sstCommand?: string;
  /** Args prepended to the `dev` subcommand — e.g. `['sst']` when `sstCommand` is `'bunx'`. */
  readonly sstCommandArgs?: readonly string[];
  /**
   * Optional explicit command list. When provided, bypasses `parseSstConfig`
   * entirely. Use this for projects whose `sst.config.ts` registers DevCommands
   * via function-call indirection (the regex parser cannot follow that).
   */
  readonly commands?: readonly CommandSpec[];
  /** Test seam — defaults to a fresh `HttpEventStream` against `<server-url>/stream`. */
  readonly eventStreamFactory?: () => EventStream<SstBusEvent>;
  /** Test seam — defaults to a `PaneLogWatcher` rooted at `<projectDir>/.sst/log/`. */
  readonly paneLogWatcherFactory?: () => PaneLogWatcher;
}
