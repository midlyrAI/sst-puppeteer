/**
 * Lint guard: no `mcp/src/** → cli/src/**` imports. Half of the original
 * cross-surface guard, scoped to the mcp package post-restructure.
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
const MCP_SRC = path.join(REPO_ROOT, 'mcp', 'src');
const MCP_BIN = path.join(REPO_ROOT, 'mcp', 'bin');
const CLI_ROOT = path.join(REPO_ROOT, 'cli');

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
  const mcpFiles: string[] = [];
  walk(MCP_SRC, mcpFiles);
  walk(MCP_BIN, mcpFiles);

  const violations: Violation[] = [];
  for (const file of mcpFiles) {
    const source = fs.readFileSync(file, 'utf-8');
    const specs = extractImportSpecifiers(source);
    for (const spec of specs) {
      const resolved = resolveRelative(file, spec);
      if (resolved === null) continue;
      if (isUnder(resolved, CLI_ROOT)) {
        violations.push({ importer: file, specifier: spec, resolved });
      }
    }
  }
  return violations;
};

describe('lint: no mcp → cli imports', () => {
  it('mcp/src and mcp/bin do not import from cli/**', () => {
    const violations = findViolations();
    if (violations.length > 0) {
      const msg = violations
        .map(
          (v) =>
            `  ${path.relative(REPO_ROOT, v.importer)} → '${v.specifier}' (${path.relative(REPO_ROOT, v.resolved)})`,
        )
        .join('\n');
      throw new Error(`mcp → cli imports detected:\n${msg}`);
    }
    expect(violations).toEqual([]);
  });

  it('parses import/export statements only — ignores comments and string literals (smoke)', () => {
    const synthetic = [
      '// see cli/src/runner.ts for the dispatch path',
      "const docPath = 'cli/src/commands/list.ts';",
      "import { foo } from './bar.js';",
    ].join('\n');
    const specs = extractImportSpecifiers(synthetic);
    expect(specs).toEqual(['./bar.js']);
  });
});
