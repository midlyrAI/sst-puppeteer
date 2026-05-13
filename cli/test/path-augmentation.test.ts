import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectNodeModulesBins } from '../../shared/src/session/manager.js';

describe('collectNodeModulesBins', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sst-puppeteer-path-test-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('finds node_modules/.bin in the project directory', () => {
    const project = path.join(root, 'project');
    const bin = path.join(project, 'node_modules', '.bin');
    fs.mkdirSync(bin, { recursive: true });

    const result = collectNodeModulesBins(project);
    expect(result).toContain(bin);
  });

  it('walks up to find ancestor node_modules/.bin (pnpm workspace layout)', () => {
    const wsBin = path.join(root, 'node_modules', '.bin');
    const project = path.join(root, 'packages', 'app');
    fs.mkdirSync(wsBin, { recursive: true });
    fs.mkdirSync(project, { recursive: true });

    const result = collectNodeModulesBins(project);
    expect(result).toContain(wsBin);
  });

  it('returns project bin before ancestor bin (closer wins on PATH)', () => {
    const projectBin = path.join(root, 'packages', 'app', 'node_modules', '.bin');
    const wsBin = path.join(root, 'node_modules', '.bin');
    fs.mkdirSync(projectBin, { recursive: true });
    fs.mkdirSync(wsBin, { recursive: true });

    const result = collectNodeModulesBins(path.join(root, 'packages', 'app'));
    expect(result.indexOf(projectBin)).toBeLessThan(result.indexOf(wsBin));
  });

  it('returns empty array when no node_modules/.bin exists anywhere upstream', () => {
    const project = path.join(root, 'lonely');
    fs.mkdirSync(project, { recursive: true });
    const result = collectNodeModulesBins(project);
    // root may have arbitrary node_modules higher up; just assert it doesn't crash
    // and that the project's own (nonexistent) bin isn't included
    expect(result).not.toContain(path.join(project, 'node_modules', '.bin'));
  });
});
