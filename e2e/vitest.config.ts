import { defineConfig } from 'vitest/config';

/**
 * Separate vitest config for the e2e suite. `pnpm e2e` selects this via
 * `--config` so that:
 *   - the lifecycle test is included
 *   - globalSetup runs `pnpm -F cli build && pnpm -F mcp build` and
 *     materialises the fake-sst shim
 *   - testTimeout is generous (the 20s redeploy cycle needs ~25s headroom)
 */
export default defineConfig({
  test: {
    name: 'e2e',
    include: ['e2e/**/*.e2e.test.ts', 'e2e/cross-surface.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/fixtures/**'],
    globalSetup: ['e2e/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // E2E tests share global on-disk state via SST_PUPPETEER_STATE_ROOT
    // tmpdirs per describe block; running multiple files in parallel
    // would interleave fake-sst PTYs. Keep it single-threaded.
    fileParallelism: false,
    typecheck: {
      enabled: false,
    },
    passWithNoTests: false,
  },
});
