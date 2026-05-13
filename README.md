# sst-puppeteer

> A headless control layer for `sst dev` — drive the interactive TUI from AI agents, scripts, or any process. Two published packages, one shared core: pick the **MCP server** for agent hosts (Claude Code, Cursor, Codex…) or the **CLI** for scripts. Both back onto the same on-disk session store, so they see each other's sessions and survive restarts.

## Why

[SST](https://sst.dev) is the dominant TypeScript framework for serverless apps on AWS. Its dev loop has two faces:

- **Interactive TUI** (`sst dev`) — a long-running multiplexer with per-service panes, the live `/stream` deploy bus, per-pane log files, and a hot-reload cycle.
- **Non-interactive CLI** (`sst deploy`, `sst shell`, `sst secrets`, …) — one-shots. No multiplexer, no stream, no per-pane state.

A human picks the TUI by default. An AI agent has to use the non-interactive CLI by default — it can't sit at a terminal — and that's where the gap shows up.

## The problem

The non-interactive surface is a strict subset of the TUI. Things an agent **literally cannot do** without sitting inside `sst dev`:

- restart a single dev command without killing the others
- know when a deploy is actually ready (not "stdout went quiet for a few seconds")
- wait for the **next** ready after an edit triggers a redeploy
- tail the per-pane log file SST only writes when running under the TUI
- react to `BuildFailedEvent` / `DeployFailedEvent` / `CompleteEvent` from `/stream`
- distinguish "still building" from "errored" from "disconnected"

To get parity an agent would have to drive the TUI itself: spawn a PTY, send keystrokes, parse a concatenated-JSON event bus, tail log files, mirror SST's state machine. That's exactly what sst-puppeteer does — once — so every MCP-capable agent gets TUI-equivalent control through a clean tool surface. For everything that **does** fit in the non-interactive CLI (`deploy`, `remove`, `secrets`, `unlock`, …), there's a single `run_sst` passthrough.

## How to use

Two concepts the tools operate on:

- **Session** — one running `sst dev` process for a given `(projectDir, stage)`. Created by `start_session`, identified by a `sessionId`. The whole multiplexer, the event stream, the log directory — all scoped to one session.
- **Command** — one pane _inside_ a session, declared under `dev.command` in `sst.config.ts` (e.g. `api`, `web`, `worker`, `ngrok`). Identified by name within a session. `start_command` / `stop_command` / `restart_command` / `read_command_logs` act on these.

So `list_sessions` tells you "which `sst dev`'s am I running?" and `list_commands` tells you "what panes does _this_ `sst dev` have?".

Sessions are stored on disk at `~/.sst-puppeteer/sessions/<sessionId>/`. They're visible to **both** the MCP server and the CLI, and they survive MCP server restarts. Calling `start_session` for an already-running `(projectDir, stage)` is idempotent — it returns the existing `sessionId` with `reused: true`.

### Use it as an MCP server

**1. Register the MCP server** from npm. Pick your host below.

<details open>
<summary><strong>Claude Code</strong></summary>

```sh
claude mcp add sst-puppeteer -s user -- npx -y @midlyr/sst-puppeteer-mcp
```

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "sst-puppeteer": {
      "command": "npx",
      "args": ["-y", "@midlyr/sst-puppeteer-mcp"]
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project):

```json
{
  "mcpServers": {
    "sst-puppeteer": {
      "command": "npx",
      "args": ["-y", "@midlyr/sst-puppeteer-mcp"]
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "sst-puppeteer": {
      "command": "npx",
      "args": ["-y", "@midlyr/sst-puppeteer-mcp"]
    }
  }
}
```

</details>

<details>
<summary><strong>Zed</strong></summary>

Add to `~/.config/zed/settings.json` under `context_servers`:

```json
{
  "context_servers": {
    "sst-puppeteer": {
      "command": {
        "path": "npx",
        "args": ["-y", "@midlyr/sst-puppeteer-mcp"]
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Codex CLI</strong></summary>

```sh
codex mcp add sst-puppeteer -- npx -y @midlyr/sst-puppeteer-mcp
```

</details>

**2. Restart the host.** The agent gains 12 tools: `start_session`, `list_sessions`, `wait_for_ready`, `list_commands`, `start_command`, `restart_command`, `stop_command`, `read_command_logs`, `wait_for_next_ready`, `get_command_status`, `stop_session`, plus `run_sst` for any other one-shot SST subcommand (deploy, remove, secrets, unlock…).

**3. Talk to it**

> "Start sst in /path/to/app on stage `dev`, wait for ready, then restart the `api` service and tail its logs."

The agent calls `start_session({ projectDir, stage: 'dev' })`, then `wait_for_ready`, `restart_command`, `read_command_logs` — same primitives you'd use by hand.

### Use it as a CLI

For scripts, one-shot agent invocations, or as a lower-overhead alternative to MCP (no per-prompt schema preload):

```sh
npm install -g @midlyr/sst-puppeteer-cli
sst-puppeteer --help
```

Every MCP tool has a CLI equivalent:

```sh
sst-puppeteer start /path/to/app --stage dev          # blocks until ready
sst-puppeteer list                                    # active sessions
sst-puppeteer list-commands --session <id>            # panes in this session
sst-puppeteer read-command-logs --session <id> --command-name api
sst-puppeteer restart-command --session <id> --command-name api
sst-puppeteer wait-for-next-ready --session <id>      # after an edit triggers redeploy
sst-puppeteer stop --session <id>                     # tear down the session
sst-puppeteer run-sst --project /path/to/app -- deploy --stage prod
```

Output is JSON by default (use `--pretty` for human-readable). Sessions resolve by `--session <id>` or by `(--project, --stage)`. Exit codes are stable: `0` ok, `1` runtime error, `2` usage error, `3` no matching session, `4` session unhealthy.

Because the CLI shares the on-disk session store with the MCP server, an MCP-started session shows up in `sst-puppeteer list`, and a CLI-started session is visible to MCP clients via `list_sessions`.

### Developing locally

```sh
pnpm install
pnpm cli:dev start /path/to/app --stage dev   # run CLI from src/ via tsx
pnpm mcp:dev                                  # run MCP from src/ via tsx
pnpm build                                    # produce cli/dist/ and mcp/dist/
pnpm test                                     # unit + integration tests
pnpm e2e                                      # full lifecycle against fake SST
```

To register a local build as an MCP server in Claude:

```sh
pnpm build
claude mcp add sst-puppeteer -s user -- node $(pwd)/mcp/dist/mcp/bin/sst-puppeteer-mcp.js
```

### Repo layout

```
shared/   # private workspace — core + session code, bundled into both packages
cli/      # @midlyr/sst-puppeteer-cli — published
mcp/      # @midlyr/sst-puppeteer-mcp — published
e2e/      # private workspace — end-to-end tests against the built bins
```

---

**Prerequisites:** Node ≥22 · pnpm (`corepack enable`)

**Disclaimer:** Independent community project. Not affiliated with **Anomaly Innovations** (sst.dev) or **Google** (Puppeteer). Both names used nominatively.

**License:** MIT — see [LICENSE](LICENSE).
