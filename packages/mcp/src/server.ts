import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { type SSTSession, type CommandSpec } from '@sst-puppeteer/core';
import type { ToolRegistry } from './tools/registry.js';
import { defaultRegistry } from './tools/index.js';
import { type Transport, type StdioTransport } from './transport.js';
import { type StartSessionInput } from './types/tools.js';

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
  private _started: boolean = false;

  constructor(opts: McpServerOptions) {
    this._options = opts;
    this.registry = opts.registry ?? defaultRegistry();
    this.transport = opts.transport;
  }

  getSession(sessionId: string): SSTSession | undefined {
    return this._sessions.get(sessionId);
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
        const projectDir = input['projectDir'] as string | undefined;
        if (!projectDir) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error:
                    "start_session requires 'projectDir' input (absolute path to your SST project).",
                }),
              },
            ],
            isError: true,
          };
        }
        const session = await this._options.sessionFactory({
          projectDir,
          awsProfile: input['awsProfile'] as string | undefined,
          awsRegion: input['awsRegion'] as string | undefined,
          stage: input['stage'] as string | undefined,
          commands: input['commands'] as readonly CommandSpec[] | undefined,
          sstCommand: input['sstCommand'] as string | undefined,
          sstCommandArgs: input['sstCommandArgs'] as readonly string[] | undefined,
          extraDevArgs: input['extraDevArgs'] as readonly string[] | undefined,
          env: input['env'] as Readonly<Record<string, string>> | undefined,
        });
        await session.start();
        this._sessions.set(session.id, session);
        return {
          content: [{ type: 'text', text: JSON.stringify({ sessionId: session.id }) }],
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
      return {
        tools: this.registry.list().map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
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

    await this._sdkServer?.close();
    await this.transport.stop();

    this._started = false;
    this._sdkServer = null;
  }
}

export const createMcpServer = (opts: McpServerOptions): McpServer => new McpServer(opts);
