export interface RunSummary {
  passed: number;
  failed: number;
  score: number;
  deterministicScore: number;
  epistemicScore: number;
}

export interface CaseResult {
  id: string;
  title: string;
  category: 'deterministic' | 'epistemic' | 'safety';
  passed: boolean;
  deterministicScore: number;
  epistemicScore: number;
  notes: string[];
}

export interface RunReport {
  runId: string;
  suiteName: string;
  benchmarkPack: string;
  server: string;
  model: string;
  startedAt: string;
  finishedAt: string;
  summary: RunSummary;
  cases: CaseResult[];
}

export interface StoredRun {
  id: string;
  team: string;
  submittedBy: string;
  createdAt: string;
  report: RunReport;
}

export interface McpEndpoint {
  id: string;
  name: string;
  transport: 'sse' | 'stdio' | 'streamable-http';
  urlOrCommand: string;
  authEnvVar?: string;
  notes?: string;
  createdAt: string;
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobConfig {
  suiteName: string;
  benchmarkPack: 'general';
  serverName: string;
  modelName: string;
  casesPath?: string;
  dryRun: boolean;
  deterministicWeight: number;
  mcpTransportConfig?:
    | {
        type: 'stdio';
        command: string;
        args: string[];
      }
    | {
        type: 'sse' | 'streamable-http';
        url: string;
      };
}

export interface JobEvent {
  at: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface EvalJob {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  team: string;
  submittedBy: string;
  workerId?: string;
  errorMessage?: string;
  config: JobConfig;
  events: JobEvent[];
  reportId?: string;
}

export type WorkerState = 'idle' | 'busy';

export interface WorkerInfo {
  workerId: string;
  status: WorkerState;
  lastSeenAt: string;
  currentJobId?: string;
  host?: string;
  version?: string;
}

export interface RegisteredWorker {
  workerId: string;
  createdAt: string;
  revokedAt?: string;
}
