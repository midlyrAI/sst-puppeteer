import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import {
  CommandAlreadyRunningError,
  CommandNotFoundError,
  CommandNotRunningError,
  ConfigNotFoundError,
  UpdateFailedError,
  StreamConnectionError,
} from '../../common/error/errors.js';
import { NoopLogger } from '../../common/logger/logger.js';
import { type WaitOptions, type Unsubscribe, type SessionOptions } from './session-options.js';
import { type Logger } from '../../common/logger/logger.js';
import { type SessionEvent, type StateChangeEvent } from './session-event.js';
import { SessionState } from '../state/session-state.js';
import { CommandStatus, type Command } from '../../common/contract/command.js';
import { SessionStateMachine } from '../state/session-state-machine.js';
import { CommandRegistry } from '../command/command-registry.js';
import { type Pty, type PtyUnsubscribe } from '../../common/contract/pty.js';
import { NodePtyAdapter } from '../../infra/pty/node-pty-adapter.js';
import { stripAnsi } from '../../common/ansi/ansi.js';
import { type EventStreamLike, HttpEventStream } from '../../infra/stream/http-event-stream.js';
import { PaneLogWatcher } from '../../infra/pane-log/pane-log-watcher.js';
import { type CompleteEventPayload, type SstBusEvent } from '../../infra/stream/sst-bus-event.js';
import { ServerFileWatcher } from '../../infra/discovery/server-file-watcher.js';
import { PaneNavigator } from '../pane/pane-navigator.js';
import { KEY } from '../../common/keystroke/keystroke-encoder.js';
import { parseSstConfig } from '../../infra/config/sst-config-parser.js';

let _idCounter = 0;
const _generateId = (): string => {
  _idCounter += 1;
  return `sst-session-${Date.now().toString(36)}-${_idCounter.toString(36)}`;
};

/** Quote a single shell argument for embedding in a `sh -c '...'` command. */
function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_/.@:=+,-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

type AnyEventHandler = (event: SessionEvent) => void;

export class SSTSession {
  readonly id: string;

  protected readonly logger: Logger;
  protected readonly options: SessionOptions;

  private readonly _sessionStateMachine: SessionStateMachine;
  private readonly _commandRegistry: CommandRegistry;
  private readonly _eventHandlers: Map<string, Set<AnyEventHandler>> = new Map();

  private _started = false;
  private _adapter: Pty | null = null;

  // Created in start()
  private _stdoutUnsubscribe: PtyUnsubscribe | null = null;
  private _eventStream: EventStreamLike<SstBusEvent> | null = null;
  private _paneLogWatcher: PaneLogWatcher | null = null;
  private _serverFileWatcher: ServerFileWatcher | null = null;
  private _paneNavigator: PaneNavigator | null = null;

  // Captured StreamConnectionError so it can be reused as rejection cause
  private _disconnectError: StreamConnectionError | null = null;

  // Ring buffer of last 20 stripped PTY lines for early-exit diagnostics
  private _recentStdout: string[] = [];

  // Promises tracked for lifecycle management
  private _parentExitPromise: Promise<{ code: number | null; signal: number | null }> | null = null;

  constructor(options: SessionOptions) {
    this.id = _generateId();
    this.logger = options.logger ?? new NoopLogger();
    this.options = options;
    this._sessionStateMachine = new SessionStateMachine({ logger: this.logger });
    this._commandRegistry = new CommandRegistry({ logger: this.logger });
  }

  get state(): SessionState {
    return this._sessionStateMachine.current;
  }

  async start(): Promise<void> {
    if (this._started) {
      throw new Error('SSTSession.start() called on an already-started session');
    }

    const { projectDir, stage } = this.options;
    const adapter = this.options.adapter ?? new NodePtyAdapter();
    this._adapter = adapter;

    // Pre-flight collision check: if .sst/<stage>.server exists and is alive, bail early.
    const serverFile = path.join(projectDir, '.sst', `${stage ?? 'default'}.server`);
    let existingUrl: string | null = null;
    try {
      const content = readFileSync(serverFile, 'utf8').trim();
      if (content.length > 0) existingUrl = content;
    } catch {
      // File not present — no prior session to collide with.
    }
    if (existingUrl !== null && (await ServerFileWatcher.probeUrl(existingUrl, 2_000))) {
      throw new Error(`Session already running for stage '${stage ?? 'default'}' — stop it first`);
    }

    this._started = true;

    const inner = [
      this.options.sstCommand ?? 'sst',
      ...(this.options.sstCommandArgs ?? []),
      'dev',
      ...(stage ? ['--stage', stage] : []),
      ...(this.options.extraDevArgs ?? []),
    ];

    // node-pty leaves ICRNL enabled on the slave termios, which translates our
    // `\r` (Enter) keystrokes to `\n`. SST's tcell input parser maps 0x0D to
    // KeyEnter and 0x0A to KeyLF — only the former triggers SST's Enter
    // handler. Disable ICRNL via a tiny shell wrapper so Enter works.
    const command = '/bin/sh';
    const args: string[] = [
      '-c',
      `stty -icrnl -inlcr -igncr < /dev/tty 2>/dev/null; exec ${inner.map(shellQuote).join(' ')}`,
    ];

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      SST_LOG_CHILDREN: '1',
      ...(this.options.awsProfile ? { AWS_PROFILE: this.options.awsProfile } : {}),
      ...(this.options.awsRegion ? { AWS_REGION: this.options.awsRegion } : {}),
      ...(this.options.env ?? {}),
    };

    await adapter.spawn({ command, args, cwd: projectDir, env, cols: 200, rows: 50 });

    // Subscribe to onExit immediately after spawn so we catch early exits.
    this._parentExitPromise = new Promise<{ code: number | null; signal: number | null }>(
      (resolve) => {
        adapter.onExit((code, signal) => {
          resolve({ code, signal });
        });
      },
    );

    // Capture last 20 stripped stdout lines for early-exit diagnostics.
    this._stdoutUnsubscribe = adapter.onData((chunk) => {
      this._recentStdout.push(stripAnsi(chunk));
      if (this._recentStdout.length > 20) this._recentStdout.shift();
    });

    // Wire ServerFileWatcher
    this._serverFileWatcher = new ServerFileWatcher({
      projectDir,
      stage: stage ?? 'default',
      pollIntervalMs: 1000,
    });
    this._serverFileWatcher.start();

    // Discover commands
    let specs = this.options.commands;
    if (specs === undefined) {
      const configPath = path.join(projectDir, 'sst.config.ts');
      try {
        specs = parseSstConfig(configPath, { logger: this.logger });
      } catch (err) {
        if (err instanceof ConfigNotFoundError) {
          this.logger.warn(
            'SSTSession.start: sst.config.ts not found — proceeding with empty command list. ' +
              'Use SessionOptions.commands to supply commands explicitly.',
            { configPath },
          );
          specs = [];
        } else {
          throw err;
        }
      }
    }

    if (specs.length === 0) {
      this.logger.warn(
        'SSTSession.start: no commands registered. Use SessionOptions.commands or ensure ' +
          'sst.config.ts contains DevCommand declarations.',
      );
    }

    for (const spec of specs) {
      this._commandRegistry.register(spec);
    }

    // Wire EventStream — subscribes to <server-url>/stream once URL is known.
    const eventStream =
      this.options.eventStreamFactory?.() ??
      new HttpEventStream<SstBusEvent>({ logger: this.logger });
    this._eventStream = eventStream;
    eventStream.onEvent((ev) => this._handleStreamEvent(ev));
    eventStream.onError((err) => this._handleStreamError(err));

    // Subscribe once we have a URL (if not provided via factory which presumably
    // doesn't need one, we still call start to follow the lifecycle contract).
    const watcher = this._serverFileWatcher;
    const startStreamWithUrl = (rawUrl: string): void => {
      const base = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
      const url = `${base}/stream`;
      void eventStream.start({ url }).catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err));
        this.logger.warn('SSTSession: eventStream.start rejected', { err: e.message });
      });
    };
    const existing = watcher.getUrl();
    if (existing !== null) {
      startStreamWithUrl(existing);
    } else {
      const unsub = watcher.onUrl((url) => {
        unsub();
        startStreamWithUrl(url);
      });
    }

    // Wire PaneLogWatcher — adds entries for each known command spec.
    const paneLogWatcher =
      this.options.paneLogWatcherFactory?.() ??
      new PaneLogWatcher({ projectDir, logger: this.logger });
    this._paneLogWatcher = paneLogWatcher;
    paneLogWatcher.onStarted(({ name }) => this._handlePaneStarted(name));
    paneLogWatcher.onStopped(({ name }) => this._handlePaneStopped(name));
    for (const spec of specs) {
      paneLogWatcher.addCommand(spec.name);
    }

    // Instantiate PaneNavigator
    this._paneNavigator = new PaneNavigator({
      adapter,
      commandRegistry: this._commandRegistry,
      settleMs: 100,
    });

    // Race: wait for 'ready' state OR early exit from SST
    const readyPromise = this._sessionStateMachine.waitFor(SessionState.READY, 5 * 60 * 1000);
    const exitRejector = this._parentExitPromise.then(({ code, signal }) => {
      throw new Error(
        `sst dev exited during startup (code=${code}, signal=${signal}). ` +
          `Last 20 lines of output:\n${this._recentStdout.join('')}`,
      );
    });

    await Promise.race([readyPromise, exitRejector]);
  }

  async stop(): Promise<void> {
    if (!this._started) {
      return;
    }

    // Tear-down sources first
    await this._eventStream?.stop();
    await this._paneLogWatcher?.stop();
    this._serverFileWatcher?.stop();
    this._stdoutUnsubscribe?.();
    this._stdoutUnsubscribe = null;

    // Send SIGINT to parent SST
    this._adapter?.kill('SIGINT');

    // Wait up to 5s for exit
    if (this._parentExitPromise !== null) {
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
      await Promise.race([this._parentExitPromise, timeoutPromise]);

      // Check if it actually exited; if not, SIGKILL
      const didExit = await Promise.race([
        this._parentExitPromise.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 0)),
      ]);

      if (!didExit) {
        this._adapter?.kill('SIGKILL');
        await Promise.race([
          this._parentExitPromise,
          new Promise<void>((resolve) => setTimeout(resolve, 3000)),
        ]);
      }
    }

    // Clean up
    this._started = false;
    this._adapter = null;
    this._eventStream = null;
    this._paneLogWatcher = null;
    this._serverFileWatcher = null;
    this._paneNavigator = null;
    this._parentExitPromise = null;
  }

  async waitForReady(opts?: WaitOptions): Promise<{ state: SessionState; durationMs: number }> {
    if (this.state === SessionState.DISCONNECTED) {
      throw this._disconnectError ?? new StreamConnectionError('Stream disconnected', '', 0);
    }

    const startedAt = Date.now();
    const timeoutMs = opts?.timeoutMs ?? 5 * 60 * 1000;
    await this._raceWithDisconnect(
      this._sessionStateMachine.waitFor(SessionState.READY, timeoutMs),
    );

    // Wait for autostart commands
    const autostartCommands = this._commandRegistry
      .list()
      .filter((cmd) => cmd.spec.autostart === true);

    for (const cmd of autostartCommands) {
      const elapsed = Date.now() - startedAt;
      const remaining = timeoutMs - elapsed;
      if (remaining <= 0) {
        throw new UpdateFailedError(
          `waitForReady timed out waiting for autostart command '${cmd.spec.name}'`,
        );
      }
      await this._raceWithDisconnect(
        this._commandRegistry.waitForStatus(cmd.spec.name, CommandStatus.RUNNING, remaining),
      );
    }

    return { state: this.state, durationMs: Date.now() - startedAt };
  }

  async waitForNextReady(
    opts?: WaitOptions & { commandName?: string },
  ): Promise<{ state: SessionState; durationMs: number }> {
    if (this.state === SessionState.DISCONNECTED) {
      throw this._disconnectError ?? new StreamConnectionError('Stream disconnected', '', 0);
    }

    const startedAt = Date.now();
    const timeoutMs = opts?.timeoutMs ?? 60_000;

    if (opts?.commandName !== undefined) {
      const name = opts.commandName;
      if (this._commandRegistry.get(name) === undefined) {
        throw new CommandNotFoundError(`No command named '${name}'`);
      }

      return this._raceWithDisconnect(
        new Promise<{ state: SessionState; durationMs: number }>((resolve, reject) => {
          let phase: 'waiting-for-exit' | 'waiting-for-running' = 'waiting-for-exit';

          const timer = setTimeout(() => {
            unsub();
            reject(new UpdateFailedError(`waitForNextReady timed out for command '${name}'`));
          }, timeoutMs);

          const unsub = this._commandRegistry.onChange((changedName, _from, to) => {
            if (changedName !== name) return;
            if (phase === 'waiting-for-exit') {
              if (
                to === CommandStatus.STOPPED ||
                to === CommandStatus.ERRORED ||
                to === CommandStatus.STARTING
              ) {
                phase = 'waiting-for-running';
              }
            } else if (phase === 'waiting-for-running') {
              if (to === CommandStatus.RUNNING) {
                clearTimeout(timer);
                unsub();
                resolve({ state: this.state, durationMs: Date.now() - startedAt });
              } else if (to === CommandStatus.ERRORED) {
                clearTimeout(timer);
                unsub();
                reject(new UpdateFailedError(`Command '${name}' errored during redeploy`));
              }
            }
          });
        }),
      );
    }

    return this._raceWithDisconnect(
      new Promise<{ state: SessionState; durationMs: number }>((resolve, reject) => {
        let phase: 'waiting-for-busy' | 'waiting-for-ready' = 'waiting-for-busy';

        const timer = setTimeout(() => {
          unsub();
          reject(new UpdateFailedError('waitForNextReady timed out'));
        }, timeoutMs);

        const unsub = this._sessionStateMachine.onChange((_from, to) => {
          if (phase === 'waiting-for-busy') {
            if (to === SessionState.BUSY) phase = 'waiting-for-ready';
          } else if (phase === 'waiting-for-ready') {
            if (to === SessionState.READY) {
              clearTimeout(timer);
              unsub();
              resolve({ state: this.state, durationMs: Date.now() - startedAt });
            } else if (to === SessionState.ERROR) {
              clearTimeout(timer);
              unsub();
              reject(
                new UpdateFailedError(`Update failed during dev cycle — state became 'error'`),
              );
            }
          }
        });
      }),
    );
  }

  listCommands(): readonly Command[] {
    return this._commandRegistry.list();
  }

  getCommandStatus(name: string): CommandStatus {
    const cmd = this._commandRegistry.get(name);
    if (cmd === undefined) {
      throw new CommandNotFoundError(`No command named '${name}'`);
    }
    return cmd.status;
  }

  async startCommand(
    name: string,
  ): Promise<{ status: typeof CommandStatus.RUNNING; durationMs: number }> {
    this._assertConnected();

    const cmd = this._commandRegistry.get(name);
    if (cmd === undefined) {
      throw new CommandNotFoundError(`No command named '${name}'`);
    }

    const currentStatus = cmd.status;
    if (currentStatus === CommandStatus.RUNNING || currentStatus === CommandStatus.STARTING) {
      throw new CommandAlreadyRunningError(
        `Command '${name}' is already ${currentStatus} — stop it first`,
      );
    }

    if (this._paneNavigator === null) {
      throw new Error(`SSTSession not started — call start() before startCommand()`);
    }

    const startedAt = Date.now();

    await this._paneNavigator.navigateTo(name);
    await this._paneNavigator.sendKey(KEY.enter);

    // Optimistic status update
    this._commandRegistry.applyStatus(name, CommandStatus.STARTING);

    await this._commandRegistry.waitForStatus(name, CommandStatus.RUNNING, 60_000);

    return { status: CommandStatus.RUNNING, durationMs: Date.now() - startedAt };
  }

  async stopCommand(name: string): Promise<{ status: typeof CommandStatus.STOPPED }> {
    this._assertConnected();

    const cmd = this._commandRegistry.get(name);
    if (cmd === undefined) {
      throw new CommandNotFoundError(`No command named '${name}'`);
    }

    const currentStatus = cmd.status;
    if (currentStatus !== CommandStatus.RUNNING && currentStatus !== CommandStatus.STARTING) {
      throw new CommandNotRunningError(
        `Command '${name}' is not running (status: '${currentStatus}')`,
      );
    }

    if (this._paneNavigator === null) {
      throw new Error(`SSTSession not started — call start() before stopCommand()`);
    }

    // Hint the watcher to arm its watchdog before we send 'x' so a missed
    // literal still resolves via watchdog-timeout.
    this._paneLogWatcher?.expectStop(name);

    await this._paneNavigator.navigateTo(name);
    await this._paneNavigator.sendKey(KEY.keyX);

    await this._commandRegistry.waitForStatus(name, CommandStatus.STOPPED, 30_000);

    return { status: CommandStatus.STOPPED };
  }

  async restartCommand(
    name: string,
  ): Promise<{ status: typeof CommandStatus.RUNNING; durationMs: number }> {
    this._assertConnected();

    const startedAt = Date.now();
    const cmd = this._commandRegistry.get(name);
    if (cmd === undefined) {
      throw new CommandNotFoundError(`No command named '${name}'`);
    }

    if (cmd.status === CommandStatus.RUNNING || cmd.status === CommandStatus.STARTING) {
      await this.stopCommand(name);
    }

    await this.startCommand(name);

    return { status: CommandStatus.RUNNING, durationMs: Date.now() - startedAt };
  }

  async readCommandLogs(opts: {
    commandName: string;
    since?: number;
    limit?: number;
  }): Promise<readonly string[]> {
    if (this._commandRegistry.get(opts.commandName) === undefined) {
      throw new CommandNotFoundError(`No command named '${opts.commandName}'`);
    }

    const logPath =
      this._paneLogWatcher?.getLogPath(opts.commandName) ??
      path.join(this.options.projectDir, '.sst', 'log', `${opts.commandName}.log`);

    let content: string;
    try {
      content = readFileSync(logPath, 'utf8');
    } catch {
      return [];
    }

    let lines = content.split('\n');

    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines = lines.slice(0, -1);
    }

    if (opts.limit !== undefined && lines.length > opts.limit) {
      lines = lines.slice(lines.length - opts.limit);
    }

    return lines as readonly string[];
  }

  on<T extends SessionEvent['type']>(
    type: T,
    handler: (event: Extract<SessionEvent, { type: T }>) => void,
  ): Unsubscribe {
    let handlers = this._eventHandlers.get(type);
    if (handlers === undefined) {
      handlers = new Set();
      this._eventHandlers.set(type, handlers);
    }
    handlers.add(handler as AnyEventHandler);
    return () => {
      handlers!.delete(handler as AnyEventHandler);
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _assertConnected(): void {
    if (this.state === SessionState.DISCONNECTED) {
      throw this._disconnectError ?? new StreamConnectionError('Stream disconnected', '', 0);
    }
  }

  private _raceWithDisconnect<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const unsub = this._sessionStateMachine.onChange((_from, to) => {
        if (to === SessionState.DISCONNECTED && !settled) {
          settled = true;
          unsub();
          reject(this._disconnectError ?? new StreamConnectionError('Stream disconnected', '', 0));
        }
      });
      promise.then(
        (v) => {
          if (settled) return;
          settled = true;
          unsub();
          resolve(v);
        },
        (e: unknown) => {
          if (settled) return;
          settled = true;
          unsub();
          reject(e);
        },
      );
    });
  }

  /**
   * Reconcile the registry, log watcher, and navigator system panes against
   * the authoritative state in `CompleteEvent`. This eliminates drift between
   * any user-supplied initial command list and SST's actual TUI layout.
   */
  private _syncFromCompleteEvent(event: CompleteEventPayload): void {
    const devs = (event.Devs ?? {}) as Record<
      string,
      {
        command?: string;
        directory?: string;
        autostart?: boolean;
        title?: string;
        environment?: Record<string, string>;
      }
    >;
    const devEntries = Object.entries(devs);
    // Only resync when the event actually carries Dev information. CompleteEvents
    // emitted in tests (or any future event without the Devs map) must not wipe
    // the hint-supplied registry.
    if (devEntries.length > 0) {
      const liveNames = new Set(Object.keys(devs));
      for (const cmd of this._commandRegistry.list()) {
        if (!liveNames.has(cmd.spec.name)) {
          this._commandRegistry.unregister(cmd.spec.name);
          this._paneLogWatcher?.removeCommand(cmd.spec.name);
        }
      }
      for (const [name, dev] of devEntries) {
        if (this._commandRegistry.has(name)) continue;
        this._commandRegistry.register({
          name,
          kind: 'service',
          command: dev.command ?? '',
          directory: dev.directory,
          environment: dev.environment,
          autostart: dev.autostart ?? false,
          killable: true,
        });
        this._paneLogWatcher?.addCommand(name);
      }
    }

    this._paneNavigator?.setSystemPanes({
      hasTasks: Object.keys((event.Tasks ?? {}) as Record<string, unknown>).length > 0,
      hasTunnel: Object.keys((event.Tunnels ?? {}) as Record<string, unknown>).length > 0,
    });
  }

  private _handleStreamEvent(msg: SstBusEvent): void {
    switch (msg.type) {
      case 'project.StackCommandEvent': {
        if (msg.event.Command === 'deploy') {
          const cur = this._sessionStateMachine.current;
          if (cur === SessionState.IDLE || cur === SessionState.READY) {
            this._dispatchStateChange(cur, SessionState.BUSY);
          }
        }
        break;
      }
      case 'project.CompleteEvent': {
        this._syncFromCompleteEvent(msg.event);
        const cur = this._sessionStateMachine.current;
        // /stream replays the most recent CompleteEvent on connect, so we may
        // observe it from any state — accept the transition unconditionally.
        const errored = (msg.event.Errors?.length ?? 0) > 0;
        const target: SessionState = errored ? SessionState.ERROR : SessionState.READY;
        if (cur !== target && cur !== SessionState.DISCONNECTED) {
          this._dispatchStateChange(cur, target);
        }
        break;
      }
      case 'project.BuildFailedEvent':
      case 'deployer.DeployFailedEvent': {
        const cur = this._sessionStateMachine.current;
        if (cur !== SessionState.ERROR && cur !== SessionState.DISCONNECTED) {
          this._dispatchStateChange(cur, SessionState.ERROR);
        }
        break;
      }
      default:
        break;
    }
  }

  private _handleStreamError(err: Error): void {
    if (err instanceof StreamConnectionError) {
      this._disconnectError = err;
      const from = this._sessionStateMachine.current;
      if (from !== SessionState.DISCONNECTED) {
        this._dispatchStateChange(from, SessionState.DISCONNECTED);
      }
    }
  }

  private _handlePaneStarted(name: string): void {
    const cmd = this._commandRegistry.get(name);
    if (cmd === undefined) return;
    const from = cmd.status;
    if (from === CommandStatus.RUNNING) return; // idempotent
    this._commandRegistry.applyStatus(name, CommandStatus.RUNNING);
    this._emit({
      type: 'command-status-change',
      timestamp: Date.now(),
      commandName: name,
      from,
      to: CommandStatus.RUNNING,
    });
  }

  private _handlePaneStopped(name: string): void {
    const cmd = this._commandRegistry.get(name);
    if (cmd === undefined) return;
    const from = cmd.status;
    if (from === CommandStatus.STOPPED) return;
    this._commandRegistry.applyStatus(name, CommandStatus.STOPPED, { code: null, signal: null });
    this._emit({
      type: 'command-status-change',
      timestamp: Date.now(),
      commandName: name,
      from,
      to: CommandStatus.STOPPED,
      lastExit: { code: null, signal: null },
    });
  }

  private _dispatchStateChange(from: SessionState, to: SessionState): void {
    if (this._sessionStateMachine.current !== from) {
      return;
    }

    const event: StateChangeEvent = {
      type: 'state-change',
      from,
      to,
      timestamp: Date.now(),
    };

    this._sessionStateMachine.transition(event);
    this._emit(event);
  }

  private _emit(event: SessionEvent): void {
    const handlers = this._eventHandlers.get(event.type);
    if (handlers === undefined) return;
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (err) {
        this.logger.warn('[SSTSession] event handler threw', { err });
      }
    }
  }
}
