import tseslint from 'typescript-eslint';

// Shared pattern: native PTY / runtime imports allowed only in infra/pty/.
const NATIVE_RUNTIME_BAN = {
  group: ['node-pty', 'node-pty/*', 'child_process', 'bun', 'bun:*'],
  message: 'native PTY / runtime imports are restricted to infra/pty/.',
};

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

  // ============================================================================
  // Layer DAG: domain → infra → common (single direction; common is leaf).
  // Within domain: session → pane → command → state (single direction).
  // Within infra: siblings independent.
  // Within common: siblings independent.
  //
  // ESLint flat config "last writer wins" per rule, so each per-folder rule
  // below merges the native-runtime ban with its own DAG bans into a single
  // `patterns` array. Adding rules at multiple levels would silently cancel
  // the broader one.
  // ============================================================================

  // ----- common/ siblings: leaf-of-leaf, no cross-imports anywhere. ----------
  {
    files: ['packages/core/src/common/error/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../logger/*', '../keystroke/*', '../ansi/*', '../contract/*'],
              message: 'common/error/ is a leaf — no imports from common/ siblings.',
            },
            {
              group: ['../../domain/*', '../../infra/*'],
              message: 'common/ is the leaf layer — must not import from domain/ or infra/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/common/logger/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../error/*', '../keystroke/*', '../ansi/*', '../contract/*'],
              message: 'common/logger/ is a leaf — no imports from common/ siblings.',
            },
            {
              group: ['../../domain/*', '../../infra/*'],
              message: 'common/ is the leaf layer — must not import from domain/ or infra/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/common/keystroke/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../error/*', '../logger/*', '../ansi/*', '../contract/*'],
              message: 'common/keystroke/ is a leaf — no imports from common/ siblings.',
            },
            {
              group: ['../../domain/*', '../../infra/*'],
              message: 'common/ is the leaf layer — must not import from domain/ or infra/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/common/ansi/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../error/*', '../logger/*', '../keystroke/*', '../contract/*'],
              message: 'common/ansi/ is a leaf — no imports from common/ siblings.',
            },
            {
              group: ['../../domain/*', '../../infra/*'],
              message: 'common/ is the leaf layer — must not import from domain/ or infra/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/common/contract/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../error/*', '../logger/*', '../keystroke/*', '../ansi/*'],
              message: 'common/contract/ is pure types — no imports from common/ siblings.',
            },
            {
              group: ['../../domain/*', '../../infra/*'],
              message: 'common/ is the leaf layer — must not import from domain/ or infra/.',
            },
          ],
        },
      ],
    },
  },

  // ----- infra/ siblings: independent + no imports from domain/. -------------
  {
    files: ['packages/core/src/infra/pty/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // infra/pty IS the only place node-pty is allowed — no NATIVE_RUNTIME_BAN here.
            {
              group: ['../stream/*', '../discovery/*', '../pane-log/*', '../config/*'],
              message: 'infra/ siblings are independent — no cross-sibling imports.',
            },
            {
              group: ['../../domain/*'],
              message: 'infra/ may not import from domain/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/infra/stream/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../pty/*', '../discovery/*', '../pane-log/*', '../config/*'],
              message: 'infra/ siblings are independent — no cross-sibling imports.',
            },
            {
              group: ['../../domain/*'],
              message: 'infra/ may not import from domain/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/infra/discovery/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../pty/*', '../stream/*', '../pane-log/*', '../config/*'],
              message: 'infra/ siblings are independent — no cross-sibling imports.',
            },
            {
              group: ['../../domain/*'],
              message: 'infra/ may not import from domain/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/infra/pane-log/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../pty/*', '../stream/*', '../discovery/*', '../config/*'],
              message: 'infra/ siblings are independent — no cross-sibling imports.',
            },
            {
              group: ['../../domain/*'],
              message: 'infra/ may not import from domain/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/infra/config/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../pty/*', '../stream/*', '../discovery/*', '../pane-log/*'],
              message: 'infra/ siblings are independent — no cross-sibling imports.',
            },
            {
              group: ['../../domain/*'],
              message: 'infra/ may not import from domain/.',
            },
          ],
        },
      ],
    },
  },

  // ----- domain/ DAG: session → pane → command → state. ---------------------
  {
    files: ['packages/core/src/domain/session/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [NATIVE_RUNTIME_BAN],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/domain/pane/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../session/*'],
              message: 'domain DAG: pane/ may not import from session/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/domain/command/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../session/*', '../pane/*'],
              message: 'domain DAG: command/ may only import from state/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/domain/state/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            NATIVE_RUNTIME_BAN,
            {
              group: ['../session/*', '../pane/*', '../command/*'],
              message: 'domain DAG: state/ is a leaf — may not import any domain sibling.',
            },
          ],
        },
      ],
    },
  },
);
