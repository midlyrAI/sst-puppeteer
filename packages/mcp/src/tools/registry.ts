import { type Tool } from './tool.js';

type AnyTool = Tool<unknown, unknown>;

export class ToolRegistry {
  private readonly _tools = new Map<string, AnyTool>();

  register(tool: AnyTool): void {
    this._tools.set(tool.name, tool);
  }

  get(name: string): AnyTool | undefined {
    return this._tools.get(name);
  }

  list(): readonly AnyTool[] {
    return Array.from(this._tools.values());
  }

  names(): readonly string[] {
    return Array.from(this._tools.keys());
  }

  size(): number {
    return this._tools.size;
  }
}
