# fake-sst-fixture

Hardcoded `sst dev` impersonator used by `test/e2e/lifecycle.e2e.test.ts`.
Spawned by the daemon as `sst dev --stage <stage>` via PATH resolution
(see `src/session/manager.ts:136-151` `collectNodeModulesBins`).

## What it emits (the contract)

- **URL discovery file:** `<cwd>/.sst/<stage>.server` containing a single
  line `http://127.0.0.1:<port>`. Polled by
  `src/core/infra/discovery/server-file-watcher.ts`.
- **`POST /rpc`:** always 200 (used by the watcher's collision-probe).
- **`GET /stream`:** newline-separated JSON objects matching the schemas
  in `src/core/infra/stream/sst-bus-event.ts`:
  - `project.StackCommandEvent` at boot.
  - `deployer.DeployRequestedEvent` then `project.CompleteEvent`
    (`Finished:true`, empty `Devs`/`Tasks`/`Tunnels`) every 20 s. The
    empty maps are load-bearing — non-empty `Tasks`/`Tunnels` would add
    system panes to `pane-navigator.ts`'s sort order; non-empty `Devs`
    would re-classify all panes as `kind:'service'` and clobber the
    parser-driven `Task-` heuristic.
- **Per-pane log files:** `<cwd>/.sst/log/<paneName>.log`. Initial autostart
  panes (`backend`, `fe`, `worker`, `Task-migrate`) get an empty file with
  an older mtime, then a first content line; `Task-seed` is absent until
  the first `\r` arrives for it.

## Control protocol

stdin is in raw mode. Keystrokes parsed:

| Byte(s)             | Action                                            |
| ------------------- | ------------------------------------------------- |
| `j` / `\x1b[B`,`[C` | cursor +1 (clamped to last)                       |
| `k` / `\x1b[A`,`[D` | cursor -1 (clamped to 0)                          |
| `\r`                | re-run selected pane (writes `--- restarted ---`) |
| `x`                 | stop selected pane (writes `--- stopped ---`)     |

The internal sort order mirrors `_localSortOrder` in
`src/core/domain/pane/pane-navigator.ts:58-94`. **Important:** that method
is `private` and not exported — the comparator is duplicated here as a
documented drift risk. If the navigator's sort key ever changes, this
fake must be updated in lockstep.

## Drift-watch files

When any of these change in `src/`, re-validate this fake:

1. `src/core/infra/discovery/server-file-watcher.ts` — URL file path/format.
2. `src/core/infra/pane-log/pane-log-watcher.ts` — log path + mtime rules.
3. `src/core/infra/stream/sst-bus-event.ts` — event schemas.
4. `src/core/infra/config/sst-config-parser.ts` — `Task-` prefix → `task` kind.
5. `src/core/domain/pane/pane-navigator.ts:58-94` — sort comparator.
6. `src/core/common/keystroke/keystroke-encoder.ts` — keystroke set.

## Version pin

Targets SST v3.x as observed at the commit of this fixture's introduction
(branch `feat/e2e-fixture`). On any SST major bump, re-grep the event
shapes above and update.

## Non-goals

- Configurability (env vars, CLI flags). Variants are separate fixture
  files.
- Failure injection. Same — add a `fake-sst-failure/` sibling later.
- Windows fidelity. The repo doesn't ship `node-pty` Windows binaries.
