import type { RunReport, StoredRun } from './types';
import { runReportSchema } from './validation';

export interface RunRepository {
  listRuns(): Promise<StoredRun[]>;
  addRun(input: { team: string; submittedBy: string; report: RunReport }): Promise<StoredRun>;
  replaceAll(runs: StoredRun[]): Promise<void>;
  exportPayload(): Promise<{ schemaVersion: '0.1.0'; runs: StoredRun[] }>;
  importPayload(payload: unknown): Promise<StoredRun[]>;
}

const STORAGE_KEY = 'arduino-mcp-eval-runs-v1';

function sortRuns(items: StoredRun[]): StoredRun[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function parseStoredRuns(value: string | null): StoredRun[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as StoredRun[];
  } catch {
    return [];
  }
}

export class LocalStorageRunRepository implements RunRepository {
  private get storage(): Storage {
    if (typeof window === 'undefined') {
      throw new Error('LocalStorage repository can only be used in the browser.');
    }

    return window.localStorage;
  }

  async listRuns(): Promise<StoredRun[]> {
    const runs = parseStoredRuns(this.storage.getItem(STORAGE_KEY));
    return sortRuns(runs);
  }

  async addRun(input: { team: string; submittedBy: string; report: RunReport }): Promise<StoredRun> {
    const runs = await this.listRuns();
    const item: StoredRun = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      team: input.team,
      submittedBy: input.submittedBy,
      createdAt: new Date().toISOString(),
      report: input.report
    };

    const next = sortRuns([item, ...runs]);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return item;
  }

  async replaceAll(runs: StoredRun[]): Promise<void> {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(sortRuns(runs)));
  }

  async exportPayload(): Promise<{ schemaVersion: '0.1.0'; runs: StoredRun[] }> {
    return {
      schemaVersion: '0.1.0',
      runs: await this.listRuns()
    };
  }

  async importPayload(payload: unknown): Promise<StoredRun[]> {
    const parsed = this.normalizeImportPayload(payload);
    await this.replaceAll(parsed);
    return parsed;
  }

  private normalizeImportPayload(payload: unknown): StoredRun[] {
    if (Array.isArray(payload)) {
      return sortRuns(payload as StoredRun[]);
    }

    if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (Array.isArray(record.runs)) {
        return sortRuns(record.runs as StoredRun[]);
      }

      if (typeof record.runId === 'string') {
        const report = runReportSchema.parse(record) as RunReport;
        const single: StoredRun = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          team: 'imported',
          submittedBy: 'import',
          createdAt: new Date().toISOString(),
          report
        };
        return [single];
      }
    }

    throw new Error('Unsupported JSON format. Use exported dashboard JSON or a run-report JSON object.');
  }
}

export class DatabaseRunRepository implements RunRepository {
  constructor(private readonly connectionString?: string) {
    void this.connectionString;
  }

  async listRuns(): Promise<StoredRun[]> {
    throw new Error('Database repository stub: implement listRuns() when DB is configured.');
  }

  async addRun(_input: { team: string; submittedBy: string; report: RunReport }): Promise<StoredRun> {
    throw new Error('Database repository stub: implement addRun() when DB is configured.');
  }

  async replaceAll(_runs: StoredRun[]): Promise<void> {
    throw new Error('Database repository stub: implement replaceAll() when DB is configured.');
  }

  async exportPayload(): Promise<{ schemaVersion: '0.1.0'; runs: StoredRun[] }> {
    throw new Error('Database repository stub: implement exportPayload() when DB is configured.');
  }

  async importPayload(_payload: unknown): Promise<StoredRun[]> {
    throw new Error('Database repository stub: implement importPayload() when DB is configured.');
  }
}

export function createRunRepository(mode: 'local' | 'database' = 'local'): RunRepository {
  if (mode === 'database') {
    return new DatabaseRunRepository(process.env.NEXT_PUBLIC_DATABASE_URL);
  }

  return new LocalStorageRunRepository();
}
