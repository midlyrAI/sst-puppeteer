import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliWaitForReadyOutputSchema } from '../../shared/src/session/wire-schemas.js';
import { WaitForReadyOutputSchema } from '../../mcp/src/types/tools.js';

const repoRoot = path.resolve(__dirname, '../..');
const wireSchemasPath = path.join(repoRoot, 'shared/src/session/wire-schemas.ts');
const mcpToolsPath = path.join(repoRoot, 'mcp/src/types/tools.ts');

describe('schema decoupling', () => {
  it('shared wire-schemas does not import from mcp/**', () => {
    const src = readFileSync(wireSchemasPath, 'utf8');
    expect(src).not.toMatch(/from\s+['"][^'"]*\/mcp\//);
  });

  it('MCP tools.ts does not import from cli/**', () => {
    const src = readFileSync(mcpToolsPath, 'utf8');
    expect(src).not.toMatch(/from\s+['"][^'"]*\/cli\//);
  });

  it('CLI and MCP output schemas are equivalent but independent', () => {
    const payload = { state: 'ready', durationMs: 100 };
    expect(CliWaitForReadyOutputSchema.safeParse(payload).success).toBe(true);
    expect(WaitForReadyOutputSchema.safeParse(payload).success).toBe(true);
    // Different identities — proves independence.
    expect(CliWaitForReadyOutputSchema).not.toBe(WaitForReadyOutputSchema);
  });
});
