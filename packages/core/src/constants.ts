export const EVENT_TYPES = [
  'state-change',
  'deploy-progress',
  'command-status-change',
  'log-line',
  'error',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const DEFAULT_TIMEOUTS = {
  waitForReady: 120_000,
  waitForRedeploy: 60_000,
  invokeFunction: 30_000,
} as const;

export const DEFAULT_INVOCATION_HISTORY_LIMIT = 100;
export const DEFAULT_DEDUP_TTL_MS = 5_000;

export { DEPLOY_STATES } from './domain/deploy-state.js';
