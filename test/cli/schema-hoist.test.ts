import { describe, expect, it } from 'vitest';
import {
  StartSessionInputSchema as CoreStartSessionInputSchema,
  TOOL_NAMES as CoreToolNames,
} from '../../src/core/contract/tool-schemas.js';
import {
  StartSessionInputSchema as McpStartSessionInputSchema,
  TOOL_NAMES as McpToolNames,
} from '../../src/mcp/types/tools.js';

describe('schema hoist', () => {
  it('mcp re-export is the same identity as the core schema', () => {
    expect(McpStartSessionInputSchema).toBe(CoreStartSessionInputSchema);
    expect(McpToolNames).toBe(CoreToolNames);
  });

  it('StartSessionInputSchema.safeParse accepts a minimal valid input', () => {
    const result = CoreStartSessionInputSchema.safeParse({ projectDir: '/x' });
    expect(result.success).toBe(true);
  });
});
