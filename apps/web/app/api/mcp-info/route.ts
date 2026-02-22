import { NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const runtime = 'nodejs';

type TransportConfig =
  | { type: 'stdio'; command: string; args: string[] }
  | { type: 'sse' | 'streamable-http'; url: string };

type McpInfoPayload = {
  serverName: string;
  mcpTransportConfig: TransportConfig;
};

type ResourcesLike = {
  resources?: Array<{ name?: string; uri?: string }>;
};

type PromptsLike = {
  prompts?: Array<{ name?: string }>;
};

type ToolLike = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

function extractInputKeysFromSchema(inputSchema: unknown): string[] {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return [];
  }

  const schema = inputSchema as {
    properties?: Record<string, unknown>;
    type?: string;
  };

  if (!schema.properties || typeof schema.properties !== 'object') {
    return [];
  }

  return Object.keys(schema.properties);
}

function extractRequiredKeysFromSchema(inputSchema: unknown): string[] {
  if (!inputSchema || typeof inputSchema !== 'object') {
    return [];
  }

  const schema = inputSchema as {
    required?: unknown;
  };

  if (!Array.isArray(schema.required)) {
    return [];
  }

  return schema.required.filter((item): item is string => typeof item === 'string');
}

function isMcpInfoPayload(value: unknown): value is McpInfoPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<McpInfoPayload>;

  if (typeof payload.serverName !== 'string' || payload.serverName.trim().length === 0) {
    return false;
  }

  const cfg = payload.mcpTransportConfig as Partial<TransportConfig> | undefined;
  if (!cfg || typeof cfg !== 'object' || typeof cfg.type !== 'string') {
    return false;
  }

  if (cfg.type === 'stdio') {
    return typeof cfg.command === 'string' && Array.isArray(cfg.args);
  }

  if (cfg.type === 'sse' || cfg.type === 'streamable-http') {
    return typeof cfg.url === 'string';
  }

  return false;
}

export async function POST(request: Request) {
  const payload = (await request.json()) as unknown;

  if (!isMcpInfoPayload(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const client = new Client({ name: 'mcp-agent-eval-web', version: '0.1.0' }, { capabilities: {} });

  let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

  if (payload.mcpTransportConfig.type === 'stdio') {
    transport = new StdioClientTransport({
      command: payload.mcpTransportConfig.command,
      args: payload.mcpTransportConfig.args
    });
  } else if (payload.mcpTransportConfig.type === 'sse') {
    transport = new SSEClientTransport(new URL(payload.mcpTransportConfig.url));
  } else {
    transport = new StreamableHTTPClientTransport(new URL(payload.mcpTransportConfig.url));
  }

  try {
    await client.connect(transport);

    const toolsResult = await client.listTools();
    const toolDetails = toolsResult.tools.map((tool: ToolLike) => ({
      name: tool.name,
      description: tool.description ?? '',
      inputKeys: extractInputKeysFromSchema(tool.inputSchema),
      requiredKeys: extractRequiredKeysFromSchema(tool.inputSchema)
    }));
    const tools = toolDetails.map((tool) => tool.name);

    let resources: string[] = [];
    let prompts: string[] = [];

    try {
      const listResourcesFn = (client as unknown as { listResources?: () => Promise<ResourcesLike> }).listResources;
      if (listResourcesFn) {
        const resourcesResult = await listResourcesFn.call(client);
        resources =
          resourcesResult.resources?.map((item) => item.name ?? item.uri ?? '').filter((v) => v.length > 0) ?? [];
      }
    } catch {
      resources = [];
    }

    try {
      const listPromptsFn = (client as unknown as { listPrompts?: () => Promise<PromptsLike> }).listPrompts;
      if (listPromptsFn) {
        const promptsResult = await listPromptsFn.call(client);
        prompts = promptsResult.prompts?.map((item) => item.name ?? '').filter((v) => v.length > 0) ?? [];
      }
    } catch {
      prompts = [];
    }

    return NextResponse.json({
      connected: true,
      serverName: payload.serverName,
      tools,
      toolDetails,
      resources,
      prompts
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  } finally {
    await client.close();
  }
}
