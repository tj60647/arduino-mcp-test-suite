#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { runSuite, writeReport } from '@arduino-mcp/runner';

async function ingestReport(input: {
  ingestUrl: string;
  ingestKey?: string;
  team: string;
  submittedBy: string;
  report: Awaited<ReturnType<typeof runSuite>>;
}): Promise<void> {
  const response = await fetch(input.ingestUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(input.ingestKey ? { authorization: `Bearer ${input.ingestKey}` } : {})
    },
    body: JSON.stringify({
      team: input.team,
      submittedBy: input.submittedBy,
      report: input.report
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ingest failed (${response.status}): ${text}`);
  }
}

const program = new Command();

program
  .name('run-suite')
  .description('Run Arduino MCP evaluation suite')
  .option('--suite <name>', 'suite name', 'pilot')
  .option('--server <name>', 'MCP server identifier', 'arduino-mcp-local')
  .option('--model <name>', 'model identifier', 'chatgpt-or-claude')
  .option('--cases <path>', 'path to eval cases', 'cases/pilot')
  .option('--out <path>', 'output report path', 'reports/run-report.json')
  .option('--team <name>', 'team label for shared dashboard', 'default')
  .option('--submitted-by <name>', 'person or runner label', 'local-user')
  .option('--ingest-url <url>', 'POST endpoint for report ingestion')
  .option('--ingest-key <key>', 'Bearer token for ingestion auth')
  .option('--dry-run', 'run with dry-run MCP adapter', false)
  .action(async (options) => {
    const workspaceRoot = process.env.INIT_CWD ?? process.cwd();
    const reportPath = resolve(workspaceRoot, options.out);
    const casesPath = resolve(workspaceRoot, options.cases);
    mkdirSync(dirname(reportPath), { recursive: true });

    const report = await runSuite({
      suiteName: options.suite,
      serverName: options.server,
      modelName: options.model,
      casesPath,
      dryRun: Boolean(options.dryRun),
      deterministicWeight: 0.7
    });

    writeReport(report, reportPath);

    if (options.ingestUrl) {
      await ingestReport({
        ingestUrl: options.ingestUrl,
        ingestKey: options.ingestKey,
        team: options.team,
        submittedBy: options.submittedBy,
        report
      });
    }

    console.table([
      { metric: 'passed', value: report.summary.passed },
      { metric: 'failed', value: report.summary.failed },
      { metric: 'score', value: report.summary.score.toFixed(3) },
      { metric: 'deterministic', value: report.summary.deterministicScore.toFixed(3) },
      { metric: 'epistemic', value: report.summary.epistemicScore.toFixed(3) }
    ]);

    console.log(`Report written to ${join('.', options.out)}`);
    if (options.ingestUrl) {
      console.log(`Report ingested to ${options.ingestUrl}`);
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
