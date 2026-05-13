import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'cli',
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    typecheck: {
      enabled: true,
      include: ['test/**/*.test-d.ts'],
    },
    passWithNoTests: false,
  },
});
