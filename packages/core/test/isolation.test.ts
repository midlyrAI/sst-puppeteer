import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const BANNED = /from\s+['"](?:node-pty(?:\/[^'"]*)?|child_process|bun(?::[^'"]+)?)['"]/;
const BANNED_DYNAMIC = /import\(\s*['"](?:node-pty(?:\/[^'"]*)?|child_process|bun(?::[^'"]+)?)['"]/;

const collectTsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
};

describe('core isolation', () => {
  it('contains zero imports of node-pty / child_process / bun', () => {
    const files = collectTsFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      if (BANNED.test(content) || BANNED_DYNAMIC.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
