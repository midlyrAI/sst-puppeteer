# sst-puppeteer

> A headless control layer for `sst dev` — drive serverless dev loops programmatically from any AI agent.

**Status:** SSTSession drives `sst dev` end-to-end via SST's canonical contracts:

- Spawns `sst dev --stage <stage>` with `SST_LOG_CHILDREN=1` for per-pane log files
- Discovers DevCommands via `sst.config.ts` parsing or `SessionOptions.commands` override
- Subscribes to `<SST_SERVER>/stream` NDJSON for typed deploy lifecycle events
- Detects per-command stop via `[process exited]` literal in `.sst/log/<DevCommandName>.log` (with watchdog fallback)
- Sends keystrokes (`j`/`k`/`Enter`/`x`) through PTY to drive the multiplexer
- Construct via `SessionBuilder`; `ISession` decomposed into four cohesive sub-interfaces
- Layered `transport/` ⊥ `domain/` enforced by eslint

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the load-bearing decisions and [docs/RELEASE-SMOKE.md](docs/RELEASE-SMOKE.md) for the manual real-AWS smoke runbook.

## Packages

| Package                   | Description                                                               | Bin                 |
| ------------------------- | ------------------------------------------------------------------------- | ------------------- |
| `@sst-puppeteer/core`     | Runtime-agnostic domain core (`SSTSession`, event fusion, state machines) | —                   |
| `@sst-puppeteer/pty-node` | Node PTY adapter (backed by `node-pty`)                                   | —                   |
| `@sst-puppeteer/pty-bun`  | Bun PTY adapter (backed by `Bun.spawn`)                                   | —                   |
| `@sst-puppeteer/mcp`      | MCP server frontend                                                       | `sst-puppeteer-mcp` |
| `@sst-puppeteer/cli`      | Utility CLI (version, future doctor/logs)                                 | `sst-puppeteer`     |

`mcp` and `cli` are **peer frontends** — neither depends on the other.

## Prerequisites

- Node.js ≥22 (or Bun ≥1.1)
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)

## Development

```sh
pnpm install
pnpm build       # tsc across all packages — works on Node ≥22 AND Bun ≥1.1
pnpm test        # vitest — runs under Node (Bun runtime tests deferred; see note)
pnpm lint
```

### Runtime support

The TypeScript build (`pnpm build`) is verified on both Node ≥22 and Bun ≥1.1. The `PtyAdapter` interface in `@sst-puppeteer/core` is runtime-agnostic; concrete adapters live in `@sst-puppeteer/pty-node` and `@sst-puppeteer/pty-bun`.

**Test runner note:** vitest 2.x has a known worker-pool incompatibility with Bun. Type-level tests (`*.test-d.ts`) run under Bun via `tsc`; runtime tests (`*.test.ts`) run under Node. When vitest 3.x or `bun test` parity ships, the Bun runtime test path will be re-enabled.

## Disclaimer

Independent community project. Not affiliated with **Anomaly Innovations** (sst.dev) or **Google** (Puppeteer). Both names are used nominatively.

## License

MIT — see [LICENSE](LICENSE).
