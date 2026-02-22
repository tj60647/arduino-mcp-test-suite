import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

interface WorkerRegistryEntry {
  workerId: string;
  tokenHash: string;
  createdAt: string;
  revokedAt?: string;
}

const registryPath = join(process.cwd(), 'data', 'worker-registry.json');

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function ensureStore(): Promise<void> {
  await mkdir(dirname(registryPath), { recursive: true });
  try {
    await readFile(registryPath, 'utf8');
  } catch {
    await writeFile(registryPath, '[]', 'utf8');
  }
}

async function readEntries(): Promise<WorkerRegistryEntry[]> {
  await ensureStore();
  const raw = await readFile(registryPath, 'utf8');
  return JSON.parse(raw) as WorkerRegistryEntry[];
}

async function writeEntries(entries: WorkerRegistryEntry[]): Promise<void> {
  await writeFile(registryPath, JSON.stringify(entries, null, 2), 'utf8');
}

export async function registerWorkerToken(workerId: string): Promise<{ workerId: string; token: string }> {
  const entries = await readEntries();
  const now = new Date().toISOString();
  const token = `wk_${randomBytes(24).toString('hex')}`;
  const tokenHash = sha256(token);

  const updated = entries.filter((entry) => entry.workerId !== workerId);
  updated.push({ workerId, tokenHash, createdAt: now });
  await writeEntries(updated);

  return { workerId, token };
}

export async function rotateWorkerToken(workerId: string): Promise<{ workerId: string; token: string }> {
  return registerWorkerToken(workerId);
}

export async function revokeWorkerToken(workerId: string): Promise<{ workerId: string; revokedAt: string }> {
  const entries = await readEntries();
  const now = new Date().toISOString();
  let found = false;

  const updated = entries.map((entry) => {
    if (entry.workerId !== workerId) {
      return entry;
    }

    found = true;
    return {
      ...entry,
      revokedAt: now
    };
  });

  if (!found) {
    throw new Error(`Worker not found: ${workerId}`);
  }

  await writeEntries(updated);
  return { workerId, revokedAt: now };
}

export async function listRegisteredWorkers(): Promise<Array<{ workerId: string; createdAt: string; revokedAt?: string }>> {
  const entries = await readEntries();
  return entries
    .map((entry) => ({ workerId: entry.workerId, createdAt: entry.createdAt, revokedAt: entry.revokedAt }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function verifyWorkerToken(workerId: string, token: string): Promise<boolean> {
  const entries = await readEntries();
  const entry = entries.find((candidate) => candidate.workerId === workerId);
  if (!entry || entry.revokedAt) {
    return false;
  }

  return sha256(token) === entry.tokenHash;
}
