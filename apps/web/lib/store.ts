import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StoredRun, RunReport } from './types';

const dataPath = join(process.cwd(), 'data', 'runs.json');

async function ensureStore(): Promise<void> {
  await mkdir(dirname(dataPath), { recursive: true });
  try {
    await readFile(dataPath, 'utf8');
  } catch {
    await writeFile(dataPath, '[]', 'utf8');
  }
}

export async function listRuns(): Promise<StoredRun[]> {
  await ensureStore();
  const raw = await readFile(dataPath, 'utf8');
  const items = JSON.parse(raw) as StoredRun[];
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addRun(input: { team: string; submittedBy: string; report: RunReport }): Promise<StoredRun> {
  const runs = await listRuns();
  const item: StoredRun = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    team: input.team,
    submittedBy: input.submittedBy,
    createdAt: new Date().toISOString(),
    report: input.report
  };

  runs.push(item);
  await writeFile(dataPath, JSON.stringify(runs, null, 2), 'utf8');
  return item;
}
