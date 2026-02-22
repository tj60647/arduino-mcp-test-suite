import type { Capability } from '@arduino-mcp/schemas';

export interface McpSession {
  serverName: string;
  availableCapabilities: Set<Capability>;
}

export async function connectMcp(serverName: string, dryRun: boolean): Promise<McpSession> {
  if (!dryRun) {
    throw new Error('Live MCP transport is not wired in this MVP yet. Use --dry-run for now.');
  }

  return {
    serverName,
    availableCapabilities: new Set<Capability>([
      'project_init',
      'file_write',
      'compile',
      'simulate',
      'dependency_install',
      'serial_read'
    ])
  };
}
