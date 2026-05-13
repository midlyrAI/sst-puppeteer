import { defineConfig } from 'vitest/config';

/**
 * Separate vitest config for the e2e suite. `pnpm e2e` selects this via
 * `--config` so that:
 *   - the lifecycle test is included (the default config excludes test/e2e/**)
 *   - globalSetup runs `pnpm build` and materialises the fake-sst shim
 *   - testTimeout is generous (the 20s redeploy cycle needs ~25s headroom)
 */
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.e2e.test.ts'],
    globalSetup: ['test/e2e/global-setup.ts'],
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
