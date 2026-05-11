import { z } from 'zod';
import { type Pty } from '../../common/contract/pty.js';
import { type CommandRegistry } from '../command/command-registry.js';
import { CommandNotFoundError } from '../../common/error/errors.js';
import { KEY } from '../../common/keystroke/keystroke-encoder.js';

export const NavTargetSchema = z.object({
  name: z.string(),
  killable: z.boolean(),
  alive: z.boolean(),
  isSystem: z.boolean(),
});
export type NavTarget = z.infer<typeof NavTargetSchema>;

export interface PaneNavigatorOptions {
  adapter: Pty;
  commandRegistry: CommandRegistry;
  settleMs?: number;
}

export class PaneNavigator {
  private readonly _adapter: Pty;
  private readonly _commandRegistry: CommandRegistry;
  private readonly _settleMs: number;
  private _hasTasks = false;
  private _hasTunnel = false;

  constructor(options: PaneNavigatorOptions) {
    this._adapter = options.adapter;
    this._commandRegistry = options.commandRegistry;
    this._settleMs = options.settleMs ?? 100;
  }

  /**
   * Configure which non-killable system panes SST is currently displaying.
   * SST adds the `Tasks` pane only when `CompleteEvent.Tasks` is non-empty,
   * and the `Tunnel` pane only when `CompleteEvent.Tunnels` is non-empty
   * (see SST `cmd/sst/mosaic.go:341-374`). Driving these from the actual
   * stream event keeps our sort aligned with SST's TUI.
   */
  setSystemPanes(opts: { hasTasks?: boolean; hasTunnel?: boolean }): void {
    if (opts.hasTasks !== undefined) this._hasTasks = opts.hasTasks;
    if (opts.hasTunnel !== undefined) this._hasTunnel = opts.hasTunnel;
  }

  /**
   * Mirrors SST's draw.go:255-281 sort logic.
   *
   * Sort key (ascending):
   *   1. killable: false first  (system panes at top)
   *   2. alive: true first      (running panes above stopped)
   *   3. name length: shortest first
   *
   * System pane membership is set explicitly via {@link setSystemPanes} from
   * the live `CompleteEvent` rather than guessed from DevCommand names.
   */
  private _localSortOrder(): readonly NavTarget[] {
    const commands = this._commandRegistry.list();

    const targets: NavTarget[] = [
      { name: 'SST', killable: false, alive: true, isSystem: true },
      { name: 'Functions', killable: false, alive: true, isSystem: true },
    ];

    if (this._hasTunnel) {
      targets.push({ name: 'Tunnel', killable: false, alive: true, isSystem: true });
    }
    if (this._hasTasks) {
      targets.push({ name: 'Tasks', killable: false, alive: true, isSystem: true });
    }

    for (const cmd of commands) {
      const alive = cmd.status === 'running' || cmd.status === 'starting';
      targets.push({
        name: cmd.spec.name,
        killable: cmd.spec.killable,
        alive,
        isSystem: false,
      });
    }

    targets.sort((a, b) => {
      if (a.killable !== b.killable) {
        return a.killable ? 1 : -1;
      }
      if (a.alive !== b.alive) {
        return a.alive ? -1 : 1;
      }
      return a.name.length - b.name.length;
    });

    return targets;
  }

  /**
   * Returns the index of the named command in the current sort order.
   * Throws CommandNotFoundError if the name is not found.
   *
   * Note: system panes (SST, Functions, Tasks, Tunnel) are NOT directly
   * navigable via the public API — they occupy index slots only.
   */
  private _findIndexByName(name: string): number {
    const order = this._localSortOrder();
    const idx = order.findIndex((t) => t.name === name);
    if (idx === -1 || order[idx]?.isSystem) {
      throw new CommandNotFoundError(
        `No command named '${name}' (or system panes are not navigable)`,
      );
    }
    return idx;
  }

  /**
   * Navigate to the pane with the given name by sending j/k keystrokes.
   * Derives the target index from the current CommandRegistry state before
   * each navigation so the sort order is always up to date.
   */
  async navigateTo(name: string): Promise<void> {
    const order = this._localSortOrder();
    const target = this._findIndexByName(name);

    for (let i = 0; i < order.length; i++) await this.sendKey(KEY.keyK);
    for (let i = 0; i < target; i++) await this.sendKey(KEY.keyJ);
  }

  /**
   * Write a single byte sequence to the adapter and wait settleMs for the TUI
   * to process it.
   */
  async sendKey(byteSeq: string): Promise<void> {
    this._adapter.write(byteSeq);
    await new Promise<void>((r) => setTimeout(r, this._settleMs));
  }
}
