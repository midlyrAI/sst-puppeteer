import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '.omc/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node-pty', 'node-pty/*', 'child_process', 'bun', 'bun:*'],
              message:
                'core must remain runtime-agnostic. Move runtime-specific code to packages/pty-node or packages/pty-bun.',
            },
          ],
        },
      ],
    },
  },
  // Layer boundaries (v0.3): transport <-> domain is a one-way street.
  // The api/ layer contains TypeScript interfaces only and is freely importable.
  // Note: these rules catch static `import` and `import type`, NOT dynamic `import('...')`.
  {
    files: ['packages/core/src/transport/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../domain/*', '../orchestration/*'],
              message:
                'transport/ may not depend on domain/ or orchestration/. Move shared types to api/ or invert the dependency.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../transport/*', '../orchestration/*'],
              message: 'domain/ is pure logic — may not depend on transport/ or orchestration/.',
            },
          ],
        },
      ],
    },
  },
);
