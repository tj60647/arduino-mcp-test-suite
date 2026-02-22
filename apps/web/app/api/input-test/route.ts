import { NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const runtime = 'nodejs';

type TransportConfig =
  | { type: 'stdio'; command: string; args: string[] }
  | { type: 'sse' | 'streamable-http'; url: string };

type InputTestPayload = {
  serverName: string;
  input: string;
  mcpTransportConfig: TransportConfig;
};

function isInputTestPayload(value: unknown): value is InputTestPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<InputTestPayload>;

  if (typeof payload.serverName !== 'string' || payload.serverName.trim().length === 0) {
    return false;
  }

  if (typeof payload.input !== 'string' || payload.input.trim().length === 0) {
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

function isLikelyReadOnlyToolName(name: string): boolean {
  const lower = name.toLowerCase();

  const blockedTerms = ['delete', 'remove', 'update', 'write', 'create', 'exec', 'run', 'deploy'];
  if (blockedTerms.some((term) => lower.includes(term))) {
    return false;
  }

  const preferredTerms = [
    'read',
    'list',
    'get',
    'search',
    'find',
    'query',
    'fetch',
    'ask',
    'chat',
    'complete',
    'prompt'
  ];

  return preferredTerms.some((term) => lower.includes(term));
}

function buildCandidateArgs(input: string): Array<Record<string, unknown>> {
  return [
    { input },
    { query: input },
    { text: input },
    { prompt: input },
    { message: input },
    { instruction: input }
  ];
}

export async function POST(request: Request) {
  const payload = (await request.json()) as unknown;

  if (!isInputTestPayload(payload)) {
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
    const allTools = toolsResult.tools.map((tool) => tool.name);
    const toolNames = allTools.filter((name) => isLikelyReadOnlyToolName(name));
    const orderedTools = toolNames.length > 0 ? toolNames : allTools;

    const candidateArgs = buildCandidateArgs(payload.input.trim());

    for (const toolName of orderedTools) {
      for (const args of candidateArgs) {
        try {
          const result = await client.callTool({ name: toolName, arguments: args });
          return NextResponse.json({
            connected: true,
            serverName: payload.serverName,
            toolUsed: toolName,
            argumentsUsed: args,
            result,
            availableTools: allTools
          });
        } catch {
          // Try next arg shape / tool name
        }
      }
    }

    return NextResponse.json(
      {
        connected: true,
        serverName: payload.serverName,
        error: 'Connected, but no compatible tool accepted a single text input.',
        availableTools: allTools,
        hint: 'This MCP server may require specific structured arguments.'
      },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection or tool call failed';
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  } finally {
    await client.close();
  }
}
