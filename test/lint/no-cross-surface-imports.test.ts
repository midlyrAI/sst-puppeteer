/**
 * Lint guard: no `src/cli/** → src/mcp/**` and no `src/mcp/** → src/cli/**`
 * imports. Enforces AC-8 from the spec.
 *
 * IMPORTANT — only `import`/`export ... from '...'` statements are
 * parsed; raw content (comments, string literals, file paths in
 * docstrings) is ignored. Per plan §3 / A12, line-level regex on
 * `import` / `export` / `from '...'` patterns is the chosen approach.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = url.fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(HERE), '..', '..');
const SRC = path.join(REPO_ROOT, 'src');

const walk = (dir: string, out: string[]): void => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out.push(full);
    }
  }
};

/**
 * Extract import specifiers from a TypeScript source. We deliberately only
 * scan lines whose leading token (after whitespace) is `import` or
 * `export`, and pull the quoted specifier after `from`. This skips
 * specifiers embedded in comments or unrelated string literals. Bare
 * side-effect imports (`import './foo'`) are also covered.
 */
const extractImportSpecifiers = (source: string): string[] => {
  const specs: string[] = [];
  const lines = source.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('import') && !line.startsWith('export')) continue;
    // Match `... from '...'` or side-effect `import '...'`.
    const fromMatch = line.match(/\bfrom\s+['"]([^'"]+)['"]/);
    if (fromMatch && fromMatch[1] !== undefined) {
      specs.push(fromMatch[1]);
      continue;
    }
    const sideEffect = line.match(/^import\s+['"]([^'"]+)['"]/);
    if (sideEffect && sideEffect[1] !== undefined) {
      specs.push(sideEffect[1]);
    }
  }
  return specs;
};

/**
 * Resolve a relative specifier (./, ../) against the importing file's
 * directory. Returns the absolute path with the `.ts` / `.js` extension
 * normalized off; for non-relative specifiers returns null.
 */
const resolveRelative = (importerFile: string, spec: string): string | null => {
  if (!spec.startsWith('.')) return null;
  const dir = path.dirname(importerFile);
  return path.resolve(dir, spec);
};

const isUnder = (file: string, root: string): boolean => {
  const rel = path.relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

interface Violation {
  importer: string;
  specifier: string;
  resolved: string;
  direction: 'cli->mcp' | 'mcp->cli';
}

const findViolations = (): Violation[] => {
  const cliRoot = path.join(SRC, 'cli');
  const mcpRoot = path.join(SRC, 'mcp');
  const cliFiles: string[] = [];
  const mcpFiles: string[] = [];
  walk(cliRoot, cliFiles);
  walk(mcpRoot, mcpFiles);

  const violations: Violation[] = [];

  const check = (
    files: string[],
    fromRoot: string,
    toRoot: string,
    direction: Violation['direction'],
  ): void => {
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      const specs = extractImportSpecifiers(source);
      for (const spec of specs) {
        const resolved = resolveRelative(file, spec);
        if (resolved === null) continue;
        if (isUnder(resolved, toRoot)) {
          violations.push({ importer: file, specifier: spec, resolved, direction });
        }
        // Sanity: a relative import from a cli file resolving outside the
        // cli root is fine UNLESS it's under the opposite root. fromRoot
        // is used only to scope the search; we already filtered files.
        void fromRoot;
      }
    }
  };

  check(cliFiles, cliRoot, mcpRoot, 'cli->mcp');
  check(mcpFiles, mcpRoot, cliRoot, 'mcp->cli');
  return violations;
};

describe('lint: no cross-surface imports', () => {
  it('src/cli/** does not import from src/mcp/** and vice versa', () => {
    const violations = findViolations();
    if (violations.length > 0) {
      const msg = violations
        .map(
          (v) =>
            `  ${v.direction}: ${path.relative(REPO_ROOT, v.importer)} → '${v.specifier}' (${path.relative(REPO_ROOT, v.resolved)})`,
        )
        .join('\n');
      throw new Error(`Cross-surface imports detected:\n${msg}`);
    }
    expect(violations).toEqual([]);
  });

  it('parses import/export statements only — ignores comments and string literals (smoke)', () => {
    // Synthetic source: a comment and a string literal that mention the
    // forbidden paths must NOT trigger the guard.
    const synthetic = [
      '// see src/mcp/server.ts for the dispatch path',
      "const docPath = 'src/mcp/tools/list.ts';",
      "import { foo } from './bar.js';",
    ].join('\n');
    const specs = extractImportSpecifiers(synthetic);
    expect(specs).toEqual(['./bar.js']);
  });
});
