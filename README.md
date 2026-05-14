# sst-puppeteer

> A headless control layer for `sst dev` — drive the interactive TUI from AI agents, scripts, or any process. Two published packages, one shared core: pick the **MCP server** for agent hosts (Claude Code, Cursor, Codex…) or the **CLI** for scripts.

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

---

**Disclaimer:** Independent community project. Not affiliated with **Anomaly Innovations** (sst.dev) or **Google** (Puppeteer). Both names used nominatively.

**License:** MIT — see [LICENSE](LICENSE).
