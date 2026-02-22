import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { WorkerInfo, WorkerState } from './types';

const workersPath = join(process.cwd(), 'data', 'workers.json');

async function ensureStore(): Promise<void> {
  await mkdir(dirname(workersPath), { recursive: true });
  try {
    await readFile(workersPath, 'utf8');
  } catch {
    await writeFile(workersPath, '[]', 'utf8');
  }
}

async function readWorkers(): Promise<WorkerInfo[]> {
  await ensureStore();
  const raw = await readFile(workersPath, 'utf8');
  return JSON.parse(raw) as WorkerInfo[];
}

async function writeWorkers(workers: WorkerInfo[]): Promise<void> {
  await writeFile(workersPath, JSON.stringify(workers, null, 2), 'utf8');
}

function sortByLastSeenDesc(workers: WorkerInfo[]): WorkerInfo[] {
  return [...workers].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export async function listWorkers(): Promise<WorkerInfo[]> {
  return sortByLastSeenDesc(await readWorkers());
}

export async function upsertWorkerHeartbeat(input: {
  workerId: string;
  status: WorkerState;
  currentJobId?: string;
  host?: string;
  version?: string;
}): Promise<WorkerInfo> {
  const workers = await readWorkers();
  const now = new Date().toISOString();

  let upserted: WorkerInfo | undefined;
  const updatedWorkers = workers.map((worker) => {
    if (worker.workerId !== input.workerId) {
      return worker;
    }

    upserted = {
      ...worker,
      status: input.status,
      currentJobId: input.currentJobId,
      host: input.host ?? worker.host,
      version: input.version ?? worker.version,
      lastSeenAt: now
    };
    return upserted;
  });

  if (!upserted) {
    upserted = {
      workerId: input.workerId,
      status: input.status,
      currentJobId: input.currentJobId,
      host: input.host,
      version: input.version,
      lastSeenAt: now
    };
    updatedWorkers.push(upserted);
  }

  await writeWorkers(updatedWorkers);
  return upserted;
}
