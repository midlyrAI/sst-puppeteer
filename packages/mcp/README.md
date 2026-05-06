# @sst-puppeteer/mcp

MCP server frontend for [sst-puppeteer](https://github.com/sst-puppeteer/sst-puppeteer). Exposes `SSTSession` to MCP-aware agents (Claude Code, Cursor, Cline, Zed, etc.) via the Model Context Protocol.

Ships its own bin: **`sst-puppeteer-mcp`**. Configure your MCP client to launch it directly. This package is independent from `@sst-puppeteer/cli` — they are peer frontends.

**v0.1 status:** stub. Tool surface, registry, and transport classes are wired with correct types; runtime methods throw `NotImplementedError`.

## Tools

| Tool                | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `start_session`     | Spawn `sst dev` in the target project directory |
| `wait_for_ready`    | Block until initial deploy reaches ready        |
| `wait_for_redeploy` | Block until next deploy cycle completes         |
| `invoke_function`   | Call a deployed Lambda with a payload           |
| `read_logs`         | Read structured logs for a function             |
| `stop_session`      | Gracefully shut down the session                |
