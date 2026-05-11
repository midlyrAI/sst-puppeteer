import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { type SSTSession, runSst } from '@sst-puppeteer/core';
import { toJSONSchema } from 'zod';
import type { ToolRegistry } from './tools/registry.js';
import { defaultRegistry } from './tools/index.js';
import { type Transport, type StdioTransport } from './transport.js';
import {
  RunSstInputSchema,
  StartSessionInputSchema,
  type StartSessionInput,
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

export type SessionFactory = (opts: Omit<StartSessionInput, never>) => Promise<SSTSession>;

export interface McpServerOptions {
  readonly registry?: ToolRegistry;
  readonly transport: Transport;
  readonly sessionFactory: SessionFactory;
}

export class McpServer {
  readonly registry: ToolRegistry;
  readonly transport: Transport;

  private readonly _options: McpServerOptions;
  private _sdkServer: Server | null = null;
  private _sessions: Map<string, SSTSession> = new Map();
  private _sessionMeta: Map<string, { projectDir: string; stage?: string; startedAt: number }> =
    new Map();
  private _started: boolean = false;

  constructor(opts: McpServerOptions) {
    this._options = opts;
    this.registry = opts.registry ?? defaultRegistry();
    this.transport = opts.transport;
  }

  getSession(sessionId: string): SSTSession | undefined {
    return this._sessions.get(sessionId);
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
        const session = await this._options.sessionFactory(parsed.data);
        await session.start();
        this._sessions.set(session.id, session);
        this._sessionMeta.set(session.id, {
          projectDir: parsed.data.projectDir,
          stage: parsed.data.stage,
          startedAt: Date.now(),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ sessionId: session.id }) }],
        };
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
        const sessions = [...this._sessions.entries()].map(([sessionId, s]) => {
          const meta = this._sessionMeta.get(sessionId);
          return {
            sessionId,
            projectDir: meta?.projectDir ?? '',
            stage: meta?.stage,
            state: s.state,
            startedAt: meta?.startedAt ?? 0,
          };
        });
        return {
          content: [{ type: 'text', text: JSON.stringify({ sessions }) }],
        };
      }

      const tool = this.registry.get(name);
      if (tool === undefined) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const sessionId = input['sessionId'] as string | undefined;
      if (sessionId === undefined) {
        throw new Error(`Tool ${name} requires a sessionId`);
      }
      const session = this._sessions.get(sessionId);
      if (session === undefined) {
        throw new Error(`Unknown sessionId: ${sessionId}`);
      }

      const result = await tool.execute(session, input as never);
      if (name === 'stop_session') {
        this._sessions.delete(sessionId);
        this._sessionMeta.delete(sessionId);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
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
      { name: 'sst-puppeteer-mcp', version: '0.0.0' },
      { capabilities: { tools: {} } },
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

    await Promise.allSettled([...this._sessions.values()].map((s) => s.stop()));
    this._sessions.clear();
    this._sessionMeta.clear();

    await this._sdkServer?.close();
    await this.transport.stop();

    this._started = false;
    this._sdkServer = null;
  }
}

export const createMcpServer = (opts: McpServerOptions): McpServer => new McpServer(opts);
