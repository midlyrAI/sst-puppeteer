export const DEPLOY_STATES = ['idle', 'deploying', 'ready', 'error'] as const;
export type DeployState = (typeof DEPLOY_STATES)[number];

export interface FunctionInfo {
  readonly name: string;
  readonly arn: string;
  readonly runtime: string;
  readonly handler: string;
  readonly timeoutMs: number;
}

export type ResourceGraphSnapshot = ReadonlyMap<string, FunctionInfo>;

export interface InvocationRecord {
  readonly functionName: string;
  readonly requestId: string;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly statusCode: number;
  readonly errorMessage?: string;
}
