import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evalCaseSchema, runConfigSchema, type EvalCase, type RunConfig } from '@arduino-mcp/schemas';
import { connectMcp } from './mcpClient.js';
import type { CaseResult, RunReport } from './types.js';

function loadCases(casesPath: string): EvalCase[] {
  const files = readdirSync(casesPath).filter((file) => file.endsWith('.json'));
  return files.map((file) => {
    const fullPath = join(casesPath, file);
    const parsed = JSON.parse(readFileSync(fullPath, 'utf8'));
    return evalCaseSchema.parse(parsed);
  });
}

function scoreCase(evalCase: EvalCase, availableCapabilities: Set<string>): CaseResult {
  const notes: string[] = [];

  const deterministicChecks = evalCase.objectiveChecks.map((check) => {
    if (check.type === 'requires_capability') {
      const ok = availableCapabilities.has(check.value);
      if (!ok) notes.push(`Missing capability: ${check.value}`);
      return ok ? check.weight : 0;
    }

    if (check.type === 'requires_prompt_contains') {
      const ok = evalCase.prompt.toLowerCase().includes(check.value.toLowerCase());
      if (!ok) notes.push(`Prompt missing required token: ${check.value}`);
      return ok ? check.weight : 0;
    }

    if (check.type === 'requires_question') {
      const ok = evalCase.prompt.includes('?');
      if (!ok) notes.push('Expected a clarifying question in prompt framing');
      return ok ? check.weight : 0;
    }

    return 0;
  });

  const deterministicMax = evalCase.objectiveChecks.reduce((acc, check) => acc + check.weight, 0);
  const deterministicRaw = deterministicChecks.reduce((acc, score) => acc + score, 0);
  const deterministicScore = deterministicMax > 0 ? deterministicRaw / deterministicMax : 0;

  const epistemicScore = evalCase.epistemicRubric && evalCase.epistemicRubric.length > 0
    ? evalCase.context.assumptionsAllowed ? 0.8 : 0.7
    : 1;

  const passed = deterministicScore >= 0.8 && epistemicScore >= 0.6;

  return {
    id: evalCase.id,
    title: evalCase.title,
    category: evalCase.category,
    passed,
    deterministicScore,
    epistemicScore,
    notes
  };
}

export async function runSuite(input: RunConfig): Promise<RunReport> {
  const config = runConfigSchema.parse(input);
  const startedAt = new Date().toISOString();
  const session = await connectMcp(config.serverName, config.dryRun);

  const cases = loadCases(config.casesPath);
  const caseResults = cases.map((evalCase) => scoreCase(evalCase, session.availableCapabilities));

  const passed = caseResults.filter((caseResult) => caseResult.passed).length;
  const failed = caseResults.length - passed;

  const deterministicScore = caseResults.reduce((acc, caseResult) => acc + caseResult.deterministicScore, 0) / caseResults.length;
  const epistemicScore = caseResults.reduce((acc, caseResult) => acc + caseResult.epistemicScore, 0) / caseResults.length;
  const score = (deterministicScore * config.deterministicWeight) + (epistemicScore * (1 - config.deterministicWeight));

  return {
    runId: `${startedAt}_${config.suiteName}`,
    suiteName: config.suiteName,
    server: session.serverName,
    model: config.modelName,
    startedAt,
    finishedAt: new Date().toISOString(),
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
