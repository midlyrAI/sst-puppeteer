/**
 * Typed events emitted on SST's `<SST_SERVER>/stream` NDJSON endpoint.
 *
 * Wire format (one JSON object per newline-delimited line):
 *   { "type": "<package>.<TypeName>", "event": <marshalled-event> }
 *
 * The discriminator is the fully qualified Go type path (e.g.
 * `"project.StackCommandEvent"`). Field names default to their Go
 * PascalCase identifier; only fields with explicit `json:` tags are
 * renamed. See `cmd/sst/mosaic/dev/dev.go` (Message wrapper) and the
 * source structs in `pkg/project/stack.go`,
 * `cmd/sst/mosaic/deployer/deployer.go`, and friends for the full list.
 *
 * sst-puppeteer only consumes a subset (deploy lifecycle); other events
 * are accepted via the {@link UnknownStreamMessage} fallback so the
 * stream parser does not throw on forward-compatible types.
 */

import { z } from 'zod';

export const StackCommandEventSchema = z.object({
  type: z.literal('project.StackCommandEvent'),
  event: z.object({
    App: z.string(),
    Stage: z.string(),
    Config: z.string(),
    Command: z.string(),
    Version: z.string(),
  }),
});
export type StackCommandEvent = z.infer<typeof StackCommandEventSchema>;

export const BuildSuccessEventSchema = z.object({
  type: z.literal('project.BuildSuccessEvent'),
  event: z.object({
    Files: z.array(z.string()),
    Hash: z.string(),
  }),
});
export type BuildSuccessEvent = z.infer<typeof BuildSuccessEventSchema>;

export const BuildFailedEventSchema = z.object({
  type: z.literal('project.BuildFailedEvent'),
  event: z.object({
    Error: z.string(),
  }),
});
export type BuildFailedEvent = z.infer<typeof BuildFailedEventSchema>;

export const CompleteEventPayloadSchema = z.object({
  UpdateID: z.string(),
  Errors: z.array(
    z.object({
      message: z.string(),
      urn: z.string(),
      help: z.array(z.string()),
    }),
  ),
  Finished: z.boolean(),
  Old: z.boolean(),
  Hints: z.record(z.string(), z.string()).optional(),
  Outputs: z.record(z.string(), z.unknown()).optional(),
  Versions: z.record(z.string(), z.number()).optional(),
  Links: z.unknown().optional(),
  Devs: z.unknown().optional(),
  Tasks: z.unknown().optional(),
  Resources: z.array(z.unknown()).optional(),
  ImportDiffs: z.record(z.string(), z.array(z.unknown())).optional(),
  Tunnels: z.unknown().optional(),
});
export type CompleteEventPayload = z.infer<typeof CompleteEventPayloadSchema>;

export const CompleteEventSchema = z.object({
  type: z.literal('project.CompleteEvent'),
  event: CompleteEventPayloadSchema,
});
export type CompleteEvent = z.infer<typeof CompleteEventSchema>;

const EmptyEventSchema = z.object({}).strict();

export const DeployRequestedEventSchema = z.object({
  type: z.literal('deployer.DeployRequestedEvent'),
  event: EmptyEventSchema,
});
export type DeployRequestedEvent = z.infer<typeof DeployRequestedEventSchema>;

export const DeployFailedEventSchema = z.object({
  type: z.literal('deployer.DeployFailedEvent'),
  event: z.object({ Error: z.string() }),
});
export type DeployFailedEvent = z.infer<typeof DeployFailedEventSchema>;

export const ConcurrentUpdateEventSchema = z.object({
  type: z.literal('project.ConcurrentUpdateEvent'),
  event: EmptyEventSchema,
});
export type ConcurrentUpdateEvent = z.infer<typeof ConcurrentUpdateEventSchema>;

export const CancelledEventSchema = z.object({
  type: z.literal('project.CancelledEvent'),
  event: EmptyEventSchema,
});
export type CancelledEvent = z.infer<typeof CancelledEventSchema>;

export const SkipEventSchema = z.object({
  type: z.literal('project.SkipEvent'),
  event: EmptyEventSchema,
});
export type SkipEvent = z.infer<typeof SkipEventSchema>;

export const FileChangedEventSchema = z.object({
  type: z.literal('watcher.FileChangedEvent'),
  event: z.object({ Path: z.string() }),
});
export type FileChangedEvent = z.infer<typeof FileChangedEventSchema>;

export const SstBusEventSchema = z.discriminatedUnion('type', [
  StackCommandEventSchema,
  BuildSuccessEventSchema,
  BuildFailedEventSchema,
  CompleteEventSchema,
  DeployRequestedEventSchema,
  DeployFailedEventSchema,
  ConcurrentUpdateEventSchema,
  CancelledEventSchema,
  SkipEventSchema,
  FileChangedEventSchema,
]);
export type SstBusEvent = z.infer<typeof SstBusEventSchema>;

/**
 * Catch-all for events the wire emits that this package does not (yet)
 * consume — e.g. AWS function/task events, Cloudflare worker events,
 * UI events. Keeps the parser tolerant of future SST additions.
 */
export const UnknownStreamMessageSchema = z.object({
  type: z.string(),
  event: z.unknown(),
});
export type UnknownStreamMessage = z.infer<typeof UnknownStreamMessageSchema>;

export const StreamMessageSchema = z.union([SstBusEventSchema, UnknownStreamMessageSchema]);
export type StreamMessage = z.infer<typeof StreamMessageSchema>;

const KNOWN_TYPES: ReadonlySet<string> = new Set<SstBusEvent['type']>([
  'project.StackCommandEvent',
  'project.BuildSuccessEvent',
  'project.BuildFailedEvent',
  'project.CompleteEvent',
  'deployer.DeployRequestedEvent',
  'deployer.DeployFailedEvent',
  'project.ConcurrentUpdateEvent',
  'project.CancelledEvent',
  'project.SkipEvent',
  'watcher.FileChangedEvent',
]);

export function isKnownStreamType(type: string): type is SstBusEvent['type'] {
  return KNOWN_TYPES.has(type);
}

export function isSstBusEvent(msg: StreamMessage): msg is SstBusEvent {
  return isKnownStreamType(msg.type);
}
