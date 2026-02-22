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
