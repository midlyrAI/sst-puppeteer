import { statSync } from 'node:fs';
import * as path from 'node:path';
import { type Logger, NoopLogger } from '../api/logger.js';

export interface StartedEvent {
  readonly name: string;
}

export interface StoppedEvent {
  readonly name: string;
}

export interface AppendEvent {
  readonly name: string;
  readonly bytes: number;
}

export interface PaneLogWatcherOptions {
  readonly projectDir: string;
  readonly pollIntervalMs?: number;
  readonly stoppedWatchdogMs?: number;
  readonly logger?: Logger;
}

interface PaneState {
  readonly name: string;
  readonly file: string;
  size: number;
  status: 'absent' | 'started' | 'stopped';
  /** Wall-clock time of the last observed write to the log file. */
  lastGrowthAt: number | null;
  /** Set by {@link PaneLogWatcher.expectStop}; only stops issued after this time count. */
  expectStopAt: number | null;
  /** mtime captured at addCommand — used to distinguish stale leftovers from fresh activity. */
  baselineMtimeMs: number;
  /** mtime observed at the moment we marked the pane stopped — used to detect restart-via-truncation. */
  stoppedMtimeMs: number;
}

/**
 * Watches per-pane log files in `<projectDir>/.sst/log/<DevCommandName>.log`.
 *
 * Detection model:
 * 1. File mtime advances past the addCommand baseline -> `'started'`.
 * 2. After {@link expectStop}(name), once the file has been quiet
 *    (no growth) for `stoppedWatchdogMs`, emit `'stopped'`.
 *
 * SST writes per-pane logs by piping the child process's stdout/stderr to
 * `<DevCommandName>.log` (see SST's `mosaic.go` MultiWriter). When SST kills
 * the child, the file simply stops growing — there is **no in-file marker**
 * (the `[process exited]` text SST renders only lives in the multiplexer's
 * virtual-terminal display, not the log file). So a quiet-after-expectStop
 * heuristic is the only reliable signal.
 */
export class PaneLogWatcher {
  private readonly _projectDir: string;
  private readonly _pollIntervalMs: number;
  private readonly _stoppedWatchdogMs: number;
  private readonly _logger: Logger;

  private readonly _panes = new Map<string, PaneState>();
  private readonly _startedHandlers = new Set<(e: StartedEvent) => void>();
  private readonly _stoppedHandlers = new Set<(e: StoppedEvent) => void>();
  private readonly _appendHandlers = new Set<(e: AppendEvent) => void>();

  private _timer: ReturnType<typeof setInterval> | null = null;
  private _stopped = false;

  constructor(opts: PaneLogWatcherOptions) {
    this._projectDir = opts.projectDir;
    this._pollIntervalMs = opts.pollIntervalMs ?? 1_000;
    // Stop is detected as "no growth in this many ms after expectStop()" —
    // small because, after `x` is sent, SST kills the child immediately and
    // the file goes silent within sub-second.
    this._stoppedWatchdogMs = opts.stoppedWatchdogMs ?? 3_000;
    this._logger = opts.logger ?? new NoopLogger();
  }

  /** Begin watching `<projectDir>/.sst/log/<name>.log` for the named command. */
  addCommand(name: string): void {
    if (this._panes.has(name)) return;
    const file = path.join(this._projectDir, '.sst', 'log', `${name}.log`);
    // Stale `.sst/log/<name>.log` files persist across `sst dev` runs. Capture
    // the current size + mtime as a baseline so 'started' only fires when the
    // command rewrites or appends to the file during this session.
    let baselineSize = 0;
    let baselineMtime = 0;
    try {
      const st = statSync(file);
      baselineSize = st.size;
      baselineMtime = st.mtimeMs;
    } catch {
      // file does not exist yet — baselines stay 0
    }
    this._panes.set(name, {
      name,
      file,
      size: baselineSize,
      status: 'absent',
      lastGrowthAt: null,
      expectStopAt: null,
      baselineMtimeMs: baselineMtime,
      stoppedMtimeMs: 0,
    });
    this._ensureTimer();
  }

  /** Stop tracking the command — does not delete the underlying log file. */
  removeCommand(name: string): void {
    this._panes.delete(name);
    if (this._panes.size === 0) this._clearTimer();
  }

  /** Resolved path of the per-pane log file for `name`, regardless of registration. */
  getLogPath(name: string): string {
    return path.join(this._projectDir, '.sst', 'log', `${name}.log`);
  }

  /**
   * Hint that a stop has been requested for `name`. The watcher then waits
   * for the log file to go quiet for `stoppedWatchdogMs` before emitting
   * `'stopped'` — that quiet window is the only deterministic signal SST
   * exposes through the per-pane log file.
   */
  expectStop(name: string): void {
    const pane = this._panes.get(name);
    if (!pane) return;
    pane.expectStopAt = Date.now();
  }

  onStarted(handler: (e: StartedEvent) => void): () => void {
    this._startedHandlers.add(handler);
    return () => this._startedHandlers.delete(handler);
  }

  onStopped(handler: (e: StoppedEvent) => void): () => void {
    this._stoppedHandlers.add(handler);
    return () => this._stoppedHandlers.delete(handler);
  }

  onAppend(handler: (e: AppendEvent) => void): () => void {
    this._appendHandlers.add(handler);
    return () => this._appendHandlers.delete(handler);
  }

  async stop(): Promise<void> {
    this._stopped = true;
    this._clearTimer();
    this._panes.clear();
  }

  private _ensureTimer(): void {
    if (this._timer || this._stopped) return;
    this._timer = setInterval(() => this._tick(), this._pollIntervalMs);
    // Allow Node to exit even if a watcher is still active.
    if (typeof this._timer === 'object' && this._timer && 'unref' in this._timer) {
      (this._timer as { unref: () => void }).unref();
    }
  }

  private _clearTimer(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private _tick(): void {
    if (this._stopped) return;
    for (const pane of this._panes.values()) {
      this._checkPane(pane);
    }
  }

  private _checkPane(pane: PaneState): void {
    let size: number;
    let mtime: number;
    try {
      const st = statSync(pane.file);
      size = st.size;
      mtime = st.mtimeMs;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this._logger.warn('PaneLogWatcher: stat failed', {
          name: pane.name,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    const grew = size > pane.size;

    if (pane.status === 'absent') {
      if (mtime <= pane.baselineMtimeMs) return;
      pane.status = 'started';
      pane.size = size;
      pane.lastGrowthAt = Date.now();
      this._dispatchStarted({ name: pane.name });
      if (size > 0) this._dispatchAppend({ name: pane.name, bytes: size });
      return;
    }

    if (pane.status === 'stopped' && mtime > pane.stoppedMtimeMs) {
      // Restart: SST truncated/rewrote the file (mtime advances) or appended.
      // Use mtime, not size growth — `os.Create` in SST's mosaic.go truncates
      // the file on every restart, so size can drop below pane.size.
      pane.status = 'started';
      pane.size = size;
      pane.lastGrowthAt = Date.now();
      pane.expectStopAt = null;
      pane.stoppedMtimeMs = 0;
      this._dispatchStarted({ name: pane.name });
      if (size > 0) this._dispatchAppend({ name: pane.name, bytes: size });
      return;
    }

    if (grew) {
      const delta = size - pane.size;
      pane.size = size;
      pane.lastGrowthAt = Date.now();
      this._dispatchAppend({ name: pane.name, bytes: delta });
      return;
    }

    // No growth this tick — check the watchdog. Stop is declared when:
    //   1. expectStop was called, AND
    //   2. there has been no growth for at least stoppedWatchdogMs since
    //      whichever was latest: the expectStop call OR the last write.
    if (pane.status === 'started' && pane.expectStopAt !== null) {
      const lastActivity = Math.max(pane.expectStopAt, pane.lastGrowthAt ?? 0);
      if (Date.now() - lastActivity >= this._stoppedWatchdogMs) {
        pane.status = 'stopped';
        pane.expectStopAt = null;
        pane.stoppedMtimeMs = mtime;
        this._dispatchStopped({ name: pane.name });
      }
    }
  }

  private _dispatchStarted(e: StartedEvent): void {
    for (const h of this._startedHandlers) {
      try {
        h(e);
      } catch (err) {
        this._logger.error('PaneLogWatcher: started handler threw', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private _dispatchStopped(e: StoppedEvent): void {
    for (const h of this._stoppedHandlers) {
      try {
        h(e);
      } catch (err) {
        this._logger.error('PaneLogWatcher: stopped handler threw', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private _dispatchAppend(e: AppendEvent): void {
    for (const h of this._appendHandlers) {
      try {
        h(e);
      } catch (err) {
        this._logger.error('PaneLogWatcher: append handler threw', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
