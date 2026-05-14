// Root vitest workspace aggregator. `pnpm test` at the repo root runs all
// three published-or-shared workspaces in one go. The `e2e/` package is
// intentionally excluded — it has its own globalSetup that builds dist/
// and runs slow real-bin tests, invoked separately via `pnpm e2e`.
export default ['shared', 'cli', 'mcp'];
