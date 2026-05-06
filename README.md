# sst-puppeteer

> A headless control layer for `sst dev` — drive serverless dev loops programmatically from any AI agent.

**Status:** v0.1 skeleton. No runtime behavior yet — interfaces and structure only.

See [docs/VISION.md](docs/VISION.md) for the design rationale.

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
