import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Capability, McpTransportConfig } from '@arduino-mcp/schemas';

// Maps MCP server tool names → normalised Capability enum values.
// Covers both canonical names and common dialect variants.
const TOOL_TO_CAPABILITY: Record<string, Capability> = {
  // canonical
  project_init: 'project_init',
  file_write: 'file_write',
  compile: 'compile',
  upload: 'upload',
  simulate: 'simulate',
  serial_read: 'serial_read',
  serial_write: 'serial_write',
  dependency_install: 'dependency_install',
  // dialect variants
  init_project: 'project_init',
  create_project: 'project_init',
  write_file: 'file_write',
  arduino_compile: 'compile',
  build: 'compile',
  arduino_upload: 'upload',
  flash: 'upload',
  install_library: 'dependency_install',
  install_dependencies: 'dependency_install',
  read_serial: 'serial_read',
  write_serial: 'serial_write'
};

export interface McpSession {
  readonly serverName: string;
  readonly availableCapabilities: Set<Capability>;
  callTool(toolName: string, parameters: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

// ─── Dry-run stub ─────────────────────────────────────────────────────────────

function makeDryRunSession(serverName: string): McpSession {
  return {
    serverName,
    availableCapabilities: new Set<Capability>([
      'project_init',
      'file_write',
      'compile',
      'simulate',
      'dependency_install',
      'serial_read'
    ]),
    async callTool(_toolName: string, _parameters: Record<string, unknown>) {
      return { ok: true, dryRun: true };
    },
    async close() {
      // no-op
    }
  };
}

// ─── Live session ─────────────────────────────────────────────────────────────

async function makeLiveSession(
  serverName: string,
  transportConfig: McpTransportConfig
): Promise<McpSession> {
  const client = new Client(
    { name: 'arduino-mcp-eval', version: '0.1.0' },
    { capabilities: {} }
  );

  let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;

  if (transportConfig.type === 'stdio') {
    transport = new StdioClientTransport({
      command: transportConfig.command,
      args: transportConfig.args
    });
  } else if (transportConfig.type === 'sse') {
    transport = new SSEClientTransport(new URL(transportConfig.url));
  } else {
    transport = new StreamableHTTPClientTransport(new URL(transportConfig.url));
  }

  await client.connect(transport);

  // Discover capabilities by listing tools and mapping names.
  const toolsResult = await client.listTools();
  const availableCapabilities = new Set<Capability>();
  for (const tool of toolsResult.tools) {
    const cap = TOOL_TO_CAPABILITY[tool.name];
    if (cap !== undefined) {
      availableCapabilities.add(cap);
    }
  }

  return {
    serverName,
    availableCapabilities,
    async callTool(toolName: string, parameters: Record<string, unknown>) {
      const result = await client.callTool({ name: toolName, arguments: parameters });
      return result;
    },
    async close() {
      await client.close();
    }
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function connectMcp(
  serverName: string,
  dryRun: boolean,
  transportConfig?: McpTransportConfig
): Promise<McpSession> {
  if (dryRun) {
    return makeDryRunSession(serverName);
  }

  if (transportConfig === undefined) {
    throw new Error(
      'Live MCP requires an mcpTransportConfig in RunConfig. ' +
        'Pass --dry-run for offline evaluation, or provide --transport, ' +
        '--mcp-command / --mcp-url for a live server.'
    );
  }

  return makeLiveSession(serverName, transportConfig);
}
