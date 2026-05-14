import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { runSst } from '../../shared/src/core/index.js';
import { SessionManager } from '../../shared/src/session/index.js';
import { toJSONSchema } from 'zod';
import type { ToolRegistry } from './tools/registry.js';
import { defaultRegistry } from './tools/index.js';
import { type Transport, type StdioTransport } from './transport.js';
import {
  RunSstInputSchema,
  StartSessionInputSchema,
  StopSessionInputSchema,
} from './types/tools.js';

// MCP safety hints surfaced to the host's model so it can prefer safer tools.
//   readOnlyHint    — no mutations to local state or external world
//   idempotentHint  — repeating the call is safe (no extra side-effects)
//   destructiveHint — irreversible side-effects (killing processes, ending sessions)
//   openWorldHint   — touches the world outside this process (spawns sst dev,
//                     which talks to AWS / SST's deploy pipeline)
const TOOL_ANNOTATIONS: Record<
  string,
  {
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  }
> = {
  list_sessions: { readOnlyHint: true, idempotentHint: true },
  list_commands: { readOnlyHint: true, idempotentHint: true },
  get_command_status: { readOnlyHint: true, idempotentHint: true },
  read_command_logs: { readOnlyHint: true, idempotentHint: true },
  wait_for_ready: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  wait_for_next_ready: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  start_session: { openWorldHint: true },
  start_command: { openWorldHint: true },
  restart_command: { destructiveHint: true, openWorldHint: true },
  stop_command: { destructiveHint: true },
  stop_session: { destructiveHint: true },
  // run_sst is a passthrough — args may include `remove`, `unlock`, `secrets`,
  // any of which mutate cloud state. Mark both destructive and open-world.
  run_sst: { destructiveHint: true, openWorldHint: true },
};

export interface McpServerOptions {
  readonly registry?: ToolRegistry;
  readonly transport: Transport;
  /**
   * Optional shared session manager. When omitted, a fresh `SessionManager`
   * is constructed with default deps. Tests inject a stub here.
   */
  readonly sessionManager?: SessionManager;
}

export class McpServer {
  readonly registry: ToolRegistry;
  readonly transport: Transport;

  private readonly _sessionManager: SessionManager;
  private _sdkServer: Server | null = null;
  private _started: boolean = false;

  constructor(opts: McpServerOptions) {
    this.registry = opts.registry ?? defaultRegistry();
    this.transport = opts.transport;
    this._sessionManager = opts.sessionManager ?? new SessionManager();
  }

  private _validationError(
    toolName: string,
    detail: string,
  ): { content: Array<{ type: 'text'; text: string }>; isError: true } {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `${toolName}: invalid input — ${detail}` }),
        },
      ],
      isError: true,
    };
  }

  /**
   * Handle a tool call request — exposed as a method so tests can call it directly.
   */
  async _handleToolCall(
    name: string,
    input: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    try {
      if (name === 'start_session') {
        const parsed = StartSessionInputSchema.safeParse(input);
        if (!parsed.success) {
          return this._validationError('start_session', parsed.error.message);
        }
        const result = await this._sessionManager.startOrAttach({
          projectDir: parsed.data.projectDir,
          stage: parsed.data.stage ?? 'default',
          ...(parsed.data.awsProfile !== undefined ? { awsProfile: parsed.data.awsProfile } : {}),
          ...(parsed.data.awsRegion !== undefined ? { awsRegion: parsed.data.awsRegion } : {}),
          wait: true,
        });
        const payload: Record<string, unknown> = {
          sessionId: result.sessionId,
          reused: result.reused,
          status: result.status,
        };
        if (result.status === 'failed') payload['error'] = result.error;
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
      }

      if (name === 'run_sst') {
        const parsed = RunSstInputSchema.safeParse(input);
        if (!parsed.success) {
          return this._validationError('run_sst', parsed.error.message);
        }
        const result = await runSst(parsed.data);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ...result, signal: result.signal ?? null }),
            },
          ],
        };
      }

      if (name === 'list_sessions') {
        const records = await this._sessionManager.list();
        const sessions = records.map((r) => ({
          sessionId: r.sessionId,
          projectDir: r.projectDir,
          stage: r.stage,
          state: r.state,
          startedAt: r.startedAt,
          ...(r.lastUpdatedAt !== undefined ? { lastUpdatedAt: r.lastUpdatedAt } : {}),
        }));
        return {
          content: [{ type: 'text', text: JSON.stringify({ sessions }) }],
        };
      }

      if (name === 'stop_session') {
        const parsed = StopSessionInputSchema.safeParse(input);
        if (!parsed.success) {
          return this._validationError('stop_session', parsed.error.message);
        }
        const result = await this._sessionManager.stop(parsed.data.sessionId);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      const tool = this.registry.get(name);
      if (tool === undefined) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const parsed = tool.inputSchema.safeParse(input);
      if (!parsed.success) {
        return this._validationError(name, parsed.error.message);
      }

      const sessionId = (parsed.data as { sessionId?: string }).sessionId;
      if (sessionId === undefined) {
        throw new Error(`Tool ${name} requires a sessionId`);
      }

      const client = await this._sessionManager.connect(sessionId);
      try {
        const result = await tool.execute(client, parsed.data as never);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } finally {
        client.close();
      }
    } catch (err) {
      const error = err as Error;
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: error.message, name: error.name }) },
        ],
        isError: true,
      };
    }
  }

  async start(): Promise<void> {
    if (this._started) {
      throw new Error('McpServer.start() has already been called.');
    }
    this._started = true;

    this._sdkServer = new Server(
      {
        name: 'sst-puppeteer-mcp',
        version: '0.1.0',
        description:
          'Drive `sst dev` (SST’s interactive TUI) from an AI agent. Gives you per-pane ' +
          'restart, /stream deploy events, log tail, and redeploy waits — the full TUI ' +
          'surface, headless. Plus `run_sst` for one-shot SST subcommands (deploy, secrets, ' +
          'unlock…).',
      },
      {
        capabilities: { tools: {} },
        instructions:
          'You have tools to control `sst dev` — SST’s interactive TUI — without ' +
          'needing a terminal.\n\n' +
          'Concepts:\n' +
          '• Session: one running `sst dev` process for a `(projectDir, stage)` pair. ' +
          'Create with `start_session`, stop with `stop_session`. Sessions are persisted ' +
          'to disk and survive MCP server restart.\n' +
          '• Command (pane): one entry under `dev.command` in `sst.config.ts` ' +
          '(e.g. `api`, `web`, `worker`). Control with `start_command` / `stop_command` / ' +
          '`restart_command`.\n\n' +
          'Typical flow:\n' +
          '1. `start_session({projectDir, stage})` → returns `sessionId` (idempotent: ' +
          'a second call with the same `(projectDir, stage)` returns the existing ' +
          'sessionId with `reused:true`).\n' +
          '2. `wait_for_ready({sessionId})` blocks until the initial deploy completes.\n' +
          '3. `list_commands({sessionId})` shows the panes; `read_command_logs` tails one.\n' +
          '4. After an edit triggers a redeploy, `wait_for_next_ready({sessionId})` blocks ' +
          'until the next ready transition.\n' +
          '5. `restart_command({sessionId, commandName})` cycles a single pane without ' +
          'tearing down the whole session.\n' +
          '6. `stop_session({sessionId})` shuts it all down.\n\n' +
          'For one-shot subcommands (`deploy`, `remove`, `secrets`, `unlock`, …) use ' +
          '`run_sst` — no session required, no TUI involved.\n\n' +
          'Pass `sessionId` from `start_session` to every session-scoped tool.',
      },
    );

    this._sdkServer.setRequestHandler(ListToolsRequestSchema, () => {
      // Zod is the source of truth; convert to JSON Schema once at the wire
      // boundary. `$schema` and root-level `additionalProperties` are noise
      // for the MCP host and stripped here.
      return {
        tools: this.registry.list().map((t) => {
          const jsonSchema = toJSONSchema(t.inputSchema, { target: 'draft-7' }) as Record<
            string,
            unknown
          >;
          delete jsonSchema['$schema'];
          delete jsonSchema['additionalProperties'];
          return {
            name: t.name,
            description: t.description,
            inputSchema: jsonSchema as { type: 'object'; properties?: Record<string, unknown> },
            ...(TOOL_ANNOTATIONS[t.name] ? { annotations: TOOL_ANNOTATIONS[t.name] } : {}),
          };
        }),
      };
    });

    this._sdkServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this._handleToolCall(name, (args as Record<string, unknown>) ?? {});
    });

    await this.transport.start();
    const sdkTransport = (this.transport as StdioTransport).getSdkTransport();
    await this._sdkServer.connect(sdkTransport);
  }

  async stop(): Promise<void> {
    if (!this._started) {
      return;
    }

    // Daemons survive parent exit by design (plan §1 P5). McpServer.stop()
    // does NOT call any manager.stopAll() — sessions persist across MCP
    // restarts via the on-disk session store.
    await this._sdkServer?.close();
    await this.transport.stop();

    this._started = false;
    this._sdkServer = null;
  }
}

export const createMcpServer = (opts: McpServerOptions): McpServer => new McpServer(opts);
