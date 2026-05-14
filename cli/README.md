# @midlyr/sst-puppeteer-cli

A command-line for driving `sst dev` with TUI-parity control — per-pane restart, deploy waits, log tail — over a long-running session, plus a passthrough for any one-shot SST subcommand.

## Install

```sh
npm install -g @midlyr/sst-puppeteer-cli
sst-puppeteer --help
```

Requires **Node.js ≥22**.

## Usage

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

Output is JSON by default (use `--pretty` for human-readable). Sessions resolve by `--session <id>` or by `(--project, --stage)`. Sessions are stored on disk at `~/.sst-puppeteer/sessions/<sessionId>/` and survive CLI invocations — calling `start` for an already-running `(projectDir, stage)` is idempotent and returns the existing `sessionId` with `reused: true`.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | ok |
| `1` | runtime error |
| `2` | usage error |
| `3` | no matching session |
| `4` | session unhealthy |

---

**Repo:** https://github.com/midlyrAI/sst-puppeteer

**Disclaimer:** Independent community project. Not affiliated with **Anomaly Innovations** (sst.dev) or **Google** (Puppeteer). Both names used nominatively.

**License:** MIT
