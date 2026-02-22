#!/usr/bin/env node
import { resolve } from 'node:path';
import { hostname } from 'node:os';
import { Command } from 'commander';
import { getBenchmarkPackConfig, runSuite } from '@mcp-agent-eval/runner';
import type { BenchmarkPack, McpTransportConfig } from '@mcp-agent-eval/schemas';

interface WorkerJobConfig {
  suiteName: string;
  benchmarkPack: BenchmarkPack;
  serverName: string;
  modelName: string;
  casesPath?: string;
  dryRun: boolean;
  deterministicWeight: number;
  mcpTransportConfig?: McpTransportConfig;
}

interface JobPayload {
  id: string;
  team: string;
  submittedBy: string;
  config: WorkerJobConfig;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function authHeaders(apiKey?: string): HeadersInit {
  return {
    'content-type': 'application/json',
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
  };
}

async function postJobEvent(input: {
  controlPlaneUrl: string;
  jobId: string;
  apiKey?: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}): Promise<void> {
  await fetch(joinUrl(input.controlPlaneUrl, `/api/jobs/${input.jobId}/events`), {
    method: 'POST',
    headers: authHeaders(input.apiKey),
    body: JSON.stringify({ level: input.level, message: input.message })
  });
}

function resolveCasesPath(config: WorkerJobConfig, workspaceRoot: string): string {
  if (config.casesPath) {
    return resolve(workspaceRoot, config.casesPath);
  }

  return resolve(workspaceRoot, getBenchmarkPackConfig(config.benchmarkPack).defaultCasesPath);
}

async function claimNextJob(input: {
  controlPlaneUrl: string;
  workerId: string;
  apiKey?: string;
}): Promise<JobPayload | undefined> {
  const response = await fetch(joinUrl(input.controlPlaneUrl, '/api/jobs/claim'), {
    method: 'POST',
    headers: authHeaders(input.apiKey),
    body: JSON.stringify({ workerId: input.workerId })
  });

  if (response.status === 204) {
    return undefined;
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to claim job (${response.status}): ${message}`);
  }

  const payload = (await response.json()) as { job: JobPayload };
  return payload.job;
}

async function markFailed(input: {
  controlPlaneUrl: string;
  jobId: string;
  apiKey?: string;
  errorMessage: string;
}): Promise<void> {
  await fetch(joinUrl(input.controlPlaneUrl, `/api/jobs/${input.jobId}/complete`), {
    method: 'POST',
    headers: authHeaders(input.apiKey),
    body: JSON.stringify({ status: 'failed', errorMessage: input.errorMessage })
  });
}

async function markCompleted(input: {
  controlPlaneUrl: string;
  jobId: string;
  apiKey?: string;
  team: string;
  submittedBy: string;
  report: Awaited<ReturnType<typeof runSuite>>;
}): Promise<void> {
  const response = await fetch(joinUrl(input.controlPlaneUrl, `/api/jobs/${input.jobId}/complete`), {
    method: 'POST',
    headers: authHeaders(input.apiKey),
    body: JSON.stringify({
      status: 'completed',
      team: input.team,
      submittedBy: input.submittedBy,
      report: input.report
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to complete job (${response.status}): ${message}`);
  }
}

const program = new Command();

program
  .name('run-worker')
  .description('Polls control plane for jobs, executes suite runs, and reports results')
  .option('--control-plane <url>', 'Control plane base URL', 'http://localhost:3000')
  .option('--api-key <key>', 'Bearer token for control plane auth', process.env.INGEST_API_KEY)
  .option('--poll-interval-ms <ms>', 'Polling interval in milliseconds', '3000')
  .option('--worker-id <id>', 'Worker identifier', `${hostname()}-${process.pid}`)
  .option('--once', 'Claim and execute at most one job, then exit', false)
  .action(async (options) => {
    const controlPlaneUrl = options.controlPlane as string;
    const apiKey = options.apiKey as string | undefined;
    const pollIntervalMs = Number(options.pollIntervalMs);
    const workerId = options.workerId as string;
    const runOnce = Boolean(options.once);
    const workspaceRoot = process.env.INIT_CWD ?? process.cwd();

    if (Number.isNaN(pollIntervalMs) || pollIntervalMs < 250) {
      throw new Error('--poll-interval-ms must be a number >= 250');
    }

    let hasProcessedJob = false;
    while (true) {
      const job = await claimNextJob({ controlPlaneUrl, workerId, apiKey });
      if (!job) {
        if (runOnce && hasProcessedJob) {
          return;
        }
        if (runOnce && !hasProcessedJob) {
          return;
        }
        await sleep(pollIntervalMs);
        continue;
      }

      hasProcessedJob = true;

      try {
        await postJobEvent({
          controlPlaneUrl,
          jobId: job.id,
          apiKey,
          level: 'info',
          message: `Worker ${workerId} started run`
        });

        const benchmarkPack = job.config.benchmarkPack as BenchmarkPack;
        const report = await runSuite({
          suiteName: job.config.suiteName,
          benchmarkPack,
          serverName: job.config.serverName,
          modelName: job.config.modelName,
          casesPath: resolveCasesPath(job.config, workspaceRoot),
          dryRun: job.config.dryRun,
          deterministicWeight: job.config.deterministicWeight,
          mcpTransportConfig: job.config.mcpTransportConfig
        });

        await postJobEvent({
          controlPlaneUrl,
          jobId: job.id,
          apiKey,
          level: 'info',
          message: `Finished run with score ${report.summary.score.toFixed(3)}`
        });

        await markCompleted({
          controlPlaneUrl,
          jobId: job.id,
          apiKey,
          team: job.team,
          submittedBy: job.submittedBy,
          report
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await postJobEvent({
          controlPlaneUrl,
          jobId: job.id,
          apiKey,
          level: 'error',
          message
        });
        await markFailed({ controlPlaneUrl, jobId: job.id, apiKey, errorMessage: message });
      }

      if (runOnce) {
        return;
      }
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
