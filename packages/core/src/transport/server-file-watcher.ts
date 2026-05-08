/**
 * ServerFileWatcher — polls `.sst/<stage>.server` for the HTTP server URL
 * written by `sst dev`.
 *
 * SST writes the URL (single line, e.g. `http://0.0.0.0:13557`) to this file
 * when its RPC server is ready. We poll the file to:
 *   1. Detect when a session becomes live (first URL appearance).
 *   2. Detect URL changes (e.g. port collision recovery — rare but possible).
 *   3. Probe liveness via an HTTP request before starting a new session
 *      (collision detection).
 *
 * NOT used for HTTP RPC — the /rpc protocol is opaque. This file is purely
 * for discovery and liveness.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ServerFileWatcherOptions {
  readonly projectDir: string;
  readonly stage: string;
  readonly pollIntervalMs?: number;
}

export class ServerFileWatcher {
  private readonly _pollIntervalMs: number;
  private readonly _path: string;

  private _url: string | null = null;
  private _started: boolean = false;
  private _pollTimer: NodeJS.Timeout | null = null;
  private readonly _handlers: Set<(url: string) => void> = new Set();

  constructor({ projectDir, stage, pollIntervalMs = 1_000 }: ServerFileWatcherOptions) {
    this._pollIntervalMs = pollIntervalMs;
    this._path = path.join(projectDir, '.sst', `${stage}.server`);
  }

  /**
   * Start polling the server file. Idempotent — calling twice is a no-op.
   */
  start(): void {
    if (this._started) return;
    this._started = true;

    // Immediate poll, then interval
    this._tick();
    this._pollTimer = setInterval(() => {
      this._tick();
    }, this._pollIntervalMs);
  }

  /**
   * Stop polling. Idempotent. Resets `_url` to null for clean re-use.
   */
  stop(): void {
    if (!this._started) return;
    this._started = false;

    if (this._pollTimer !== null) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    this._url = null;
  }

  /**
   * Returns the currently-known server URL, or null if not yet detected.
   */
  getUrl(): string | null {
    return this._url;
  }

  /**
   * Registers a handler that fires when the server URL is first detected
   * or when the URL changes. Returns an unsubscribe function.
   */
  onUrl(handler: (url: string) => void): () => void {
    this._handlers.add(handler);
    return () => {
      this._handlers.delete(handler);
    };
  }

  /** Convenience: probe the watcher's currently-known URL (returns false if unknown). */
  probeAlive(timeoutMs = 3_000): Promise<boolean> {
    if (this._url === null) return Promise.resolve(false);
    return ServerFileWatcher.probeUrl(this._url, timeoutMs);
  }

  /**
   * Probe whether `<url>/rpc` responds. Any HTTP status means alive; only
   * network errors / timeouts return false. Used for collision detection
   * before starting a session.
   */
  static async probeUrl(url: string, timeoutMs = 3_000): Promise<boolean> {
    try {
      await fetch(`${url}/rpc`, {
        method: 'POST',
        body: '',
        signal: AbortSignal.timeout(timeoutMs),
      });
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _tick(): void {
    let content: string;
    try {
      content = fs.readFileSync(this._path, 'utf-8').trim();
    } catch {
      // File not yet present — nothing to do
      return;
    }

    if (content.length === 0) return;

    if (this._url === null || content !== this._url) {
      this._url = content;
      for (const handler of this._handlers) {
        handler(content);
      }
    }
  }
}
