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

export interface StackCommandEvent {
  readonly type: 'project.StackCommandEvent';
  readonly event: {
    readonly App: string;
    readonly Stage: string;
    readonly Config: string;
    readonly Command: string;
    readonly Version: string;
  };
}

export interface BuildSuccessEvent {
  readonly type: 'project.BuildSuccessEvent';
  readonly event: {
    readonly Files: readonly string[];
    readonly Hash: string;
  };
}

export interface BuildFailedEvent {
  readonly type: 'project.BuildFailedEvent';
  readonly event: {
    readonly Error: string;
  };
}

export interface CompleteEventPayload {
  readonly UpdateID: string;
  readonly Errors: readonly { readonly message: string; readonly urn: string; readonly help: readonly string[] }[];
  readonly Finished: boolean;
  readonly Old: boolean;
  readonly Hints?: Record<string, string>;
  readonly Outputs?: Record<string, unknown>;
  readonly Versions?: Record<string, number>;
  readonly Links?: unknown;
  readonly Devs?: unknown;
  readonly Tasks?: unknown;
  readonly Resources?: readonly unknown[];
  readonly ImportDiffs?: Record<string, readonly unknown[]>;
  readonly Tunnels?: unknown;
}

export interface CompleteEvent {
  readonly type: 'project.CompleteEvent';
  readonly event: CompleteEventPayload;
}

export interface DeployRequestedEvent {
  readonly type: 'deployer.DeployRequestedEvent';
  readonly event: Record<string, never>;
}

export interface DeployFailedEvent {
  readonly type: 'deployer.DeployFailedEvent';
  readonly event: {
    readonly Error: string;
  };
}

export interface ConcurrentUpdateEvent {
  readonly type: 'project.ConcurrentUpdateEvent';
  readonly event: Record<string, never>;
}

export interface CancelledEvent {
  readonly type: 'project.CancelledEvent';
  readonly event: Record<string, never>;
}

export interface SkipEvent {
  readonly type: 'project.SkipEvent';
  readonly event: Record<string, never>;
}

export interface FileChangedEvent {
  readonly type: 'watcher.FileChangedEvent';
  readonly event: {
    readonly Path: string;
  };
}

/**
 * Catch-all for events the wire emits that this package does not (yet)
 * consume — e.g. AWS function/task events, Cloudflare worker events,
 * UI events. Keeps the parser tolerant of future SST additions.
 */
export interface UnknownStreamMessage {
  readonly type: string;
  readonly event: unknown;
}

export type SstBusEvent =
  | StackCommandEvent
  | BuildSuccessEvent
  | BuildFailedEvent
  | CompleteEvent
  | DeployRequestedEvent
  | DeployFailedEvent
  | ConcurrentUpdateEvent
  | CancelledEvent
  | SkipEvent
  | FileChangedEvent;

export type StreamMessage = SstBusEvent | UnknownStreamMessage;

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
