import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // E2E tests are opt-in via `pnpm e2e` (which passes a path filter that
    // overrides this exclude). Default `pnpm test` runs fast and hermetic
    // without requiring `pnpm build` or a tmpdir state root.
    exclude: ['node_modules/**', 'dist/**', 'test/e2e/**'],
    typecheck: {
      enabled: true,
      include: ['test/**/*.test-d.ts'],
    },
    passWithNoTests: false,
  },
});
