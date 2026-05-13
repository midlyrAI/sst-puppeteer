# E2E test — acceptance criteria

`pnpm e2e` rotates through every CLI command and every MCP tool against the fake SST fixture in `test/fixtures/fake-sst/`. Each criterion below has at least one `it(...)` block in [`lifecycle.e2e.test.ts`](./lifecycle.e2e.test.ts) tagged with its AC ID.

| ID     | What it proves                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------- |
| AC-E1  | `pnpm e2e` exits 0 in under 60 s on a clean checkout                                                 |
| AC-E2  | Every one of the 12 MCP tools is invoked at least once during the MCP half of the rotation           |
| AC-E3  | Every CLI command equivalent is invoked at least once during the CLI half                            |
| AC-E4  | `list_commands` returns all 5 panes with correct kinds (3 services + 2 tasks) and statuses           |
| AC-E5  | Task first run — `start_command(Task-seed)` moves seed from `idle` → `running`                       |
| AC-E6  | Task rerun via stop+start — `stop_command` then `start_command` on `Task-migrate`                    |
| AC-E7  | Service restart — `restart_command(backend)` cycles the service; log shows `--- restarted ---`       |
| AC-E8  | Service stop+start — `stop_command(worker)` then `start_command(worker)`                             |
| AC-E9  | Redeploy detection — `wait_for_next_ready` resolves within ~25 s (catches the 20 s redeploy)         |
| AC-E10 | `stop_session` removes only the target session's subdir; sibling state under `tmpStateRoot` survives |
| AC-E11 | The same rotation runs once via CLI and once via MCP — both halves pass                              |

## Running

```bash
pnpm e2e        # runs only test/e2e — uses vitest.config.e2e.ts
pnpm test       # runs everything else — test/e2e is excluded
```

`pnpm e2e` runs `pnpm build` inside `globalSetup` and materializes `test/fixtures/fake-sst/node_modules/.bin/sst` at runtime (no committed symlinks). State is isolated under a `/tmp/sstp-e2e-*` directory and cleaned up in `afterAll`.

## Architecture

The fake SST fixture (`test/fixtures/fake-sst/`) is a deterministic emitter — it produces the byte streams our code actually consumes (`/stream` SSE events, per-pane log file mtimes) without driving real `sst dev`. See [`test/fixtures/fake-sst/README.md`](../fixtures/fake-sst/README.md) for the contract, drift-watch list, and source files the fake mirrors.

## Why these specific ACs

The spec (`.omc/specs/deep-interview-e2e-fixture.md`) was renegotiated mid-design after the Architect surfaced that `CommandStatus` has no `completed` value — the codebase tracks `{IDLE, STARTING, RUNNING, STOPPED, ERRORED}` and tasks have no spontaneous-exit detection. AC-E5 and AC-E6 were rewritten to use `stop_command + start_command` for task rerun rather than "observe natural completion." Zero `src/` changes.
