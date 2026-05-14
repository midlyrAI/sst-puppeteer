import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'mcp',
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    typecheck: {
      enabled: true,
      include: ['test/**/*.test-d.ts'],
    },
    passWithNoTests: false,
  },
});
