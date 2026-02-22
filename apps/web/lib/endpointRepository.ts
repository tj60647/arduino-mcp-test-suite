import type { McpEndpoint } from './types';

const STORAGE_KEY = 'mcp-eval-endpoints-v1';

function sortEndpoints(items: McpEndpoint[]): McpEndpoint[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function parseEndpoints(value: string | null): McpEndpoint[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as McpEndpoint[];
  } catch {
    return [];
  }
}

function getStorage(): Storage {
  if (typeof window === 'undefined') {
    throw new Error('Endpoint repository can only be used in browser context.');
  }

  return window.localStorage;
}

export async function listEndpoints(): Promise<McpEndpoint[]> {
  const endpoints = parseEndpoints(getStorage().getItem(STORAGE_KEY));
  return sortEndpoints(endpoints);
}

export async function addEndpoint(input: {
  name: string;
  transport: McpEndpoint['transport'];
  urlOrCommand: string;
  authEnvVar?: string;
  notes?: string;
}): Promise<McpEndpoint> {
  const endpoints = await listEndpoints();

  const item: McpEndpoint = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: input.name.trim(),
    transport: input.transport,
    urlOrCommand: input.urlOrCommand.trim(),
    authEnvVar: input.authEnvVar?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString()
  };

  const next = sortEndpoints([item, ...endpoints]);
  getStorage().setItem(STORAGE_KEY, JSON.stringify(next));
  return item;
}

export async function deleteEndpoint(id: string): Promise<void> {
  const endpoints = await listEndpoints();
  const filtered = endpoints.filter((endpoint) => endpoint.id !== id);
  getStorage().setItem(STORAGE_KEY, JSON.stringify(filtered));
}
