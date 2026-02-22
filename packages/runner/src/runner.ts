import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  evalCaseSchema,
  runConfigSchema,
  type EvalCase,
  type RunConfig,
  type RunTraceEvent
} from '@mcp-agent-eval/schemas';
import { connectMcp } from './mcpClient.js';
import type { CaseResult, RunReport } from './types.js';
import { getBenchmarkPackConfig } from './packs.js';

function now(): string {
  return new Date().toISOString();
}

function loadCases(casesPath: string): EvalCase[] {
  const files = readdirSync(casesPath).filter((file) => file.endsWith('.json'));
  return files.map((file) => {
    const fullPath = join(casesPath, file);
    const parsed = JSON.parse(readFileSync(fullPath, 'utf8'));
    return evalCaseSchema.parse(parsed);
  });
}

function normalizeCapabilities(
  availableCapabilities: Set<string>,
  aliasMap: Record<string, string>
): Set<string> {
  const normalized = new Set<string>(availableCapabilities);
  for (const [from, to] of Object.entries(aliasMap)) {
    if (availableCapabilities.has(from)) {
      normalized.add(to);
    }
  }
  return normalized;
}

function scoreCase(evalCase: EvalCase, availableCapabilities: Set<string>): CaseResult {
  const trace: RunTraceEvent[] = [];
  const notes: string[] = [];

  const deterministicChecks = evalCase.objectiveChecks.map((check) => {
    let passed = false;
    let score = 0;
    let note: string | undefined;

    if (check.type === 'requires_capability') {
      passed = availableCapabilities.has(check.value);
      score = passed ? check.weight : 0;
      if (!passed) {
        note = `Missing capability: ${check.value}`;
        notes.push(note);
      }
    } else if (check.type === 'requires_prompt_contains') {
      passed = evalCase.prompt.toLowerCase().includes(check.value.toLowerCase());
      score = passed ? check.weight : 0;
      if (!passed) {
        note = `Prompt missing required token: ${check.value}`;
        notes.push(note);
      }
    } else if (check.type === 'requires_question') {
      passed = evalCase.prompt.includes('?');
      score = passed ? check.weight : 0;
      if (!passed) {
        note = 'Expected a clarifying question in prompt framing';
        notes.push(note);
      }
    }

    const event: RunTraceEvent = {
      type: 'check_result',
      timestamp: now(),
      checkId: check.id,
      passed,
      score,
      ...(note !== undefined ? { note } : {})
    };
    trace.push(event);

    return score;
  });

  const deterministicMax = evalCase.objectiveChecks.reduce((acc, check) => acc + check.weight, 0);
  const deterministicRaw = deterministicChecks.reduce((acc, s) => acc + s, 0);
  const deterministicScore = deterministicMax > 0 ? deterministicRaw / deterministicMax : 0;

  // PLACEHOLDER — replace with LLM judge + rule guards (packages/scoring)
  const epistemicScore =
    evalCase.epistemicRubric && evalCase.epistemicRubric.length > 0
      ? evalCase.context.assumptionsAllowed
        ? 0.8
        : 0.7
      : 1;

  const passed = deterministicScore >= 0.8 && epistemicScore >= 0.6;

  return {
    id: evalCase.id,
    title: evalCase.title,
    category: evalCase.category,
    passed,
    deterministicScore,
    epistemicScore,
    notes,
    trace
  };
}

export async function runSuite(input: RunConfig): Promise<RunReport> {
  const config = runConfigSchema.parse(input);
  const startedAt = now();
  const packConfig = getBenchmarkPackConfig(config.benchmarkPack);

  const session = await connectMcp(
    config.serverName,
    config.dryRun,
    config.mcpTransportConfig
  );

  const cases = loadCases(config.casesPath).filter(
    (evalCase) => evalCase.benchmarkPack === config.benchmarkPack
  );
  const normalizedCapabilities = normalizeCapabilities(
    session.availableCapabilities,
    packConfig.capabilityAliases
  );
  const caseResults = cases.map((evalCase) =>
    scoreCase(evalCase, normalizedCapabilities)
  );

  await session.close();

  const passed = caseResults.filter((r) => r.passed).length;
  const failed = caseResults.length - passed;

  const deterministicScore =
    caseResults.length > 0
      ? caseResults.reduce((acc, r) => acc + r.deterministicScore, 0) / caseResults.length
      : 0;
  const epistemicScore =
    caseResults.length > 0
      ? caseResults.reduce((acc, r) => acc + r.epistemicScore, 0) / caseResults.length
      : 0;
  const score =
    deterministicScore * config.deterministicWeight +
    epistemicScore * (1 - config.deterministicWeight);

  return {
    runId: `${startedAt}_${config.suiteName}`,
    suiteName: config.suiteName,
    benchmarkPack: config.benchmarkPack,
    server: session.serverName,
    model: config.modelName,
    startedAt,
    finishedAt: now(),
    summary: {
      passed,
      failed,
      score,
      deterministicScore,
      epistemicScore
    },
    cases: caseResults
  };
}

export function writeReport(report: RunReport, outputPath: string): void {
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
}
