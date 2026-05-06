import { ToolRegistry } from './registry.js';
import { StartSessionTool } from './start-session-tool.js';
import { WaitForReadyTool } from './wait-for-ready-tool.js';
import { WaitForRedeployTool } from './wait-for-redeploy-tool.js';
import { InvokeFunctionTool } from './invoke-function-tool.js';
import { ReadLogsTool } from './read-logs-tool.js';
import { StopSessionTool } from './stop-session-tool.js';

export { TOOL_NAMES, type ToolName } from '../types/tools.js';
export { Tool, type ToolInputSchema } from './tool.js';
export { ToolRegistry } from './registry.js';
export { StartSessionTool } from './start-session-tool.js';
export { WaitForReadyTool } from './wait-for-ready-tool.js';
export { WaitForRedeployTool } from './wait-for-redeploy-tool.js';
export { InvokeFunctionTool } from './invoke-function-tool.js';
export { ReadLogsTool } from './read-logs-tool.js';
export { StopSessionTool } from './stop-session-tool.js';

export const defaultRegistry = (): ToolRegistry => {
  const registry = new ToolRegistry();
  registry.register(new StartSessionTool());
  registry.register(new WaitForReadyTool());
  registry.register(new WaitForRedeployTool());
  registry.register(new InvokeFunctionTool());
  registry.register(new ReadLogsTool());
  registry.register(new StopSessionTool());
  return registry;
};
