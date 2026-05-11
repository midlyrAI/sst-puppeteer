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

const BANNED_AWS = /from\s+['"]@aws-sdk\/[^'"]+['"]/;
const BANNED_AWS_DYNAMIC = /import\(\s*['"]@aws-sdk\/[^'"]+['"]/;

describe('core isolation', () => {
  it('node-pty / child_process / bun are confined to core/infra/{pty,process}/', () => {
    const ptyDir = join(SRC_DIR, 'core', 'infra', 'pty');
    const processDir = join(SRC_DIR, 'core', 'infra', 'process');
    const files = collectTsFiles(SRC_DIR).filter(
      (f) => !f.startsWith(ptyDir) && !f.startsWith(processDir),
    );
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

  it('contains zero imports of @aws-sdk/*', () => {
    const files = collectTsFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      if (BANNED_AWS.test(content) || BANNED_AWS_DYNAMIC.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
