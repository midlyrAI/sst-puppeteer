export const DEPLOY_STATES = ['idle', 'deploying', 'ready', 'error', 'disconnected'] as const;
export type DeployState = (typeof DEPLOY_STATES)[number];
