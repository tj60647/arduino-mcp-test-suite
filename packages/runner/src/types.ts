import type { EvalCase, RunTraceEvent } from '@arduino-mcp/schemas';

export interface CaseResult {
  id: string;
  title: string;
  category: EvalCase['category'];
  passed: boolean;
  deterministicScore: number;
  epistemicScore: number;
  notes: string[];
  trace: RunTraceEvent[];
}

export interface RunSummary {
  passed: number;
  failed: number;
  score: number;
  deterministicScore: number;
  epistemicScore: number;
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
