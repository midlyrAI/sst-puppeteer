# @midlyr/sst-puppeteer-mcp

An MCP server for driving `sst dev` — gives AI agents the full interactive-TUI feature set (per-pane restart, stream events, log tail, redeploy waits) plus a passthrough for one-shot SST subcommands.

## Install & register

Requires **Node.js ≥22**. Pick your host below; all snippets use `npx -y @midlyr/sst-puppeteer-mcp` so there's nothing to install ahead of time.

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

Restart the host after registering.

## Tools

The agent gains 12 tools:

- `start_session`, `list_sessions`, `stop_session`, `wait_for_ready`
- `list_commands`, `start_command`, `restart_command`, `stop_command`
- `read_command_logs`, `wait_for_next_ready`, `get_command_status`
- `run_sst` — passthrough for any other one-shot SST subcommand (deploy, remove, secrets, unlock…)

Sessions are scoped to one `(projectDir, stage)` pair, identified by a `sessionId`, and stored at `~/.sst-puppeteer/sessions/<sessionId>/`. They survive MCP server restarts. Calling `start_session` for an already-running `(projectDir, stage)` is idempotent — it returns the existing `sessionId` with `reused: true`.

## Talk to it

> "Start sst in /path/to/app on stage `dev`, wait for ready, then restart the `api` service and tail its logs."

The agent calls `start_session({ projectDir, stage: 'dev' })`, then `wait_for_ready`, `restart_command`, `read_command_logs`.

---

**Repo:** https://github.com/midlyrAI/sst-puppeteer

**Disclaimer:** Independent community project. Not affiliated with **Anomaly Innovations** (sst.dev) or **Google** (Puppeteer). Both names used nominatively.

**License:** MIT
