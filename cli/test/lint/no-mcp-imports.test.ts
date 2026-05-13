/**
 * Lint guard: no `cli/src/** → mcp/src/**` imports. Half of the original
 * cross-surface guard, scoped to the cli package post-restructure.
 *
 * IMPORTANT — only `import`/`export ... from '...'` statements are
 * parsed; raw content (comments, string literals, file paths in
 * docstrings) is ignored.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = url.fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(HERE), '..', '..', '..');
const CLI_SRC = path.join(REPO_ROOT, 'cli', 'src');
const CLI_BIN = path.join(REPO_ROOT, 'cli', 'bin');
const MCP_ROOT = path.join(REPO_ROOT, 'mcp');

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

const extractImportSpecifiers = (source: string): string[] => {
  const specs: string[] = [];
  const lines = source.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('import') && !line.startsWith('export')) continue;
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
}

const findViolations = (): Violation[] => {
  const cliFiles: string[] = [];
  walk(CLI_SRC, cliFiles);
  walk(CLI_BIN, cliFiles);

  const violations: Violation[] = [];
  for (const file of cliFiles) {
    const source = fs.readFileSync(file, 'utf-8');
    const specs = extractImportSpecifiers(source);
    for (const spec of specs) {
      const resolved = resolveRelative(file, spec);
      if (resolved === null) continue;
      if (isUnder(resolved, MCP_ROOT)) {
        violations.push({ importer: file, specifier: spec, resolved });
      }
    }
  }
  return violations;
};

describe('lint: no cli → mcp imports', () => {
  it('cli/src and cli/bin do not import from mcp/**', () => {
    const violations = findViolations();
    if (violations.length > 0) {
      const msg = violations
        .map(
          (v) =>
            `  ${path.relative(REPO_ROOT, v.importer)} → '${v.specifier}' (${path.relative(REPO_ROOT, v.resolved)})`,
        )
        .join('\n');
      throw new Error(`cli → mcp imports detected:\n${msg}`);
    }
    expect(violations).toEqual([]);
  });

  it('parses import/export statements only — ignores comments and string literals (smoke)', () => {
    const synthetic = [
      '// see mcp/src/server.ts for the dispatch path',
      "const docPath = 'mcp/src/tools/list.ts';",
      "import { foo } from './bar.js';",
    ].join('\n');
    const specs = extractImportSpecifiers(synthetic);
    expect(specs).toEqual(['./bar.js']);
  });
});
