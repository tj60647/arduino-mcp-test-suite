import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { EvalJob, JobEvent } from './types';

const jobsPath = join(process.cwd(), 'data', 'jobs.json');

async function ensureStore(): Promise<void> {
  await mkdir(dirname(jobsPath), { recursive: true });
  try {
    await readFile(jobsPath, 'utf8');
  } catch {
    await writeFile(jobsPath, '[]', 'utf8');
  }
}

async function readJobs(): Promise<EvalJob[]> {
  await ensureStore();
  const raw = await readFile(jobsPath, 'utf8');
  return JSON.parse(raw) as EvalJob[];
}

async function writeJobs(jobs: EvalJob[]): Promise<void> {
  await writeFile(jobsPath, JSON.stringify(jobs, null, 2), 'utf8');
}

function sortByCreatedAtDesc(jobs: EvalJob[]): EvalJob[] {
  return [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listJobs(): Promise<EvalJob[]> {
  return sortByCreatedAtDesc(await readJobs());
}

export async function getJob(jobId: string): Promise<EvalJob | undefined> {
  const jobs = await readJobs();
  return jobs.find((job) => job.id === jobId);
}

export async function createJob(input: {
  team: string;
  submittedBy: string;
  config: EvalJob['config'];
}): Promise<EvalJob> {
  const jobs = await readJobs();
  const now = new Date().toISOString();
  const job: EvalJob = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    team: input.team,
    submittedBy: input.submittedBy,
    config: input.config,
    events: [{ at: now, level: 'info', message: 'Job queued' }]
  };

  jobs.push(job);
  await writeJobs(jobs);
  return job;
}

export async function claimNextQueuedJob(workerId: string): Promise<EvalJob | undefined> {
  const jobs = await readJobs();
  const queued = jobs
    .filter((job) => job.status === 'queued')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

  if (!queued) {
    return undefined;
  }

  const now = new Date().toISOString();
  const claimedEvent: JobEvent = {
    at: now,
    level: 'info',
    message: `Claimed by ${workerId}`
  };
  const updatedJobs = jobs.map((job) => {
    if (job.id !== queued.id) {
      return job;
    }

    return {
      ...job,
      status: 'running' as const,
      workerId,
      startedAt: now,
      updatedAt: now,
      events: [...job.events, claimedEvent]
    };
  });

  await writeJobs(updatedJobs);
  return updatedJobs.find((job) => job.id === queued.id);
}

export async function appendJobEvent(jobId: string, event: JobEvent): Promise<EvalJob | undefined> {
  const jobs = await readJobs();
  let updatedJob: EvalJob | undefined;

  const updatedJobs = jobs.map((job) => {
    if (job.id !== jobId) {
      return job;
    }

    updatedJob = {
      ...job,
      updatedAt: event.at,
      events: [...job.events, event]
    };
    return updatedJob;
  });

  if (!updatedJob) {
    return undefined;
  }

  await writeJobs(updatedJobs);
  return updatedJob;
}

export async function completeJob(input: {
  jobId: string;
  status: 'completed' | 'failed';
  errorMessage?: string;
  reportId?: string;
}): Promise<EvalJob | undefined> {
  const jobs = await readJobs();
  let updatedJob: EvalJob | undefined;
  const now = new Date().toISOString();

  const updatedJobs = jobs.map((job) => {
    if (job.id !== input.jobId) {
      return job;
    }

    const finalEvent: JobEvent = {
      at: now,
      level: input.status === 'completed' ? 'info' : 'error',
      message: input.status === 'completed' ? 'Job completed' : `Job failed: ${input.errorMessage}`
    };

    updatedJob = {
      ...job,
      status: input.status,
      updatedAt: now,
      finishedAt: now,
      errorMessage: input.errorMessage,
      reportId: input.reportId,
      events: [...job.events, finalEvent]
    };
    return updatedJob;
  });

  if (!updatedJob) {
    return undefined;
  }

  await writeJobs(updatedJobs);
  return updatedJob;
}
