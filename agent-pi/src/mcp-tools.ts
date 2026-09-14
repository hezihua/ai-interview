import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  defineTool,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { Type, type TSchema } from "@sinclair/typebox";

type JsonSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  default?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
};

function jsonSchemaToTypeBox(schema: JsonSchema | undefined): TSchema {
  if (!schema) {
    return Type.Object({}, { additionalProperties: true });
  }
  if (schema.anyOf?.length || schema.oneOf?.length) {
    return Type.Any();
  }
  switch (schema.type) {
    case "string":
      return schema.enum
        ? Type.Unsafe<string>({ type: "string", enum: schema.enum })
        : Type.String({ description: schema.description });
    case "integer":
      return Type.Integer({ description: schema.description });
    case "number":
      return Type.Number({ description: schema.description });
    case "boolean":
      return Type.Boolean({ description: schema.description });
    case "array":
      return Type.Array(jsonSchemaToTypeBox(schema.items), {
        description: schema.description,
      });
    case "object":
    default: {
      const props = schema.properties || {};
      const required = new Set(schema.required || []);
      const shape: Record<string, TSchema> = {};
      for (const [key, prop] of Object.entries(props)) {
        const t = jsonSchemaToTypeBox(prop);
        shape[key] = required.has(key) ? t : Type.Optional(t);
      }
      return Type.Object(shape, {
        additionalProperties: true,
        description: schema.description,
      });
    }
  }
}

function resultToText(result: {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
}): string {
  const parts: string[] = [];
  for (const block of result.content || []) {
    if (block?.type === "text" && block.text) {
      parts.push(block.text);
    }
  }
  if (parts.length) return parts.join("\n");
  if (result.structuredContent != null) {
    return JSON.stringify(result.structuredContent, null, 2);
  }
  return JSON.stringify(result);
}

export class McpToolBridge {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private callChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly url: string,
    private readonly authToken: string,
  ) {}

  async connect(): Promise<void> {
    if (this.client) return;
    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }
    const transport = new StreamableHTTPClientTransport(new URL(this.url), {
      requestInit: { headers },
    });
    const client = new Client({
      name: "ai-interview-agent-pi",
      version: "1.0.0",
    });
    await client.connect(transport);
    this.transport = transport;
    this.client = client;
  }

  async close(): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;
    try {
      await client?.close();
    } catch {
      /* ignore */
    }
    try {
      await transport?.close();
    } catch {
      /* ignore */
    }
  }

  /** Streamable HTTP 单会话不能并行 callTool，必须串行。 */
  private async callToolSerial(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    if (!this.client) {
      throw new Error("MCP client is not connected");
    }
    const client = this.client;
    const run = this.callChain.then(() =>
      client.callTool({ name, arguments: args }, undefined, { signal }),
    );
    this.callChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async loadTools(): Promise<ToolDefinition[]> {
    if (!this.client) {
      throw new Error("MCP client is not connected");
    }
    const listed = await this.client.listTools();
    return listed.tools.map((tool) => {
      const parameters = jsonSchemaToTypeBox(
        tool.inputSchema as JsonSchema | undefined,
      );
      return defineTool({
        name: tool.name,
        label: tool.name,
        description: tool.description || tool.name,
        promptSnippet: tool.description || tool.name,
        parameters,
        executionMode: "sequential",
        execute: async (_toolCallId, params, signal) => {
          if (signal?.aborted) {
            return {
              content: [{ type: "text", text: "Cancelled" }],
              details: {},
            };
          }
          console.log(`[agent-pi] mcp call ${tool.name}`);
          const result = await this.callToolSerial(
            tool.name,
            (params || {}) as Record<string, unknown>,
            signal,
          );
          const text = resultToText(
            result as {
              content?: Array<{ type?: string; text?: string }>;
              structuredContent?: unknown;
            },
          );
          console.log(
            `[agent-pi] mcp done ${tool.name} chars=${text.length}`,
          );
          return {
            content: [{ type: "text", text }],
            details: {},
          };
        },
      });
    });
  }
}
