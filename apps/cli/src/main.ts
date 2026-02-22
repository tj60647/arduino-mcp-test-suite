#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { getBenchmarkPackConfig, runSuite, writeReport } from '@arduino-mcp/runner';
import type { BenchmarkPack, McpTransportConfig } from '@arduino-mcp/schemas';

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

function buildTransportConfig(options: {
  transport?: string;
  mcpCommand?: string;
  mcpArgs?: string;
  mcpUrl?: string;
  dryRun?: boolean;
}): McpTransportConfig | undefined {
  if (options.dryRun) return undefined;

  const transportType = options.transport ?? 'stdio';

  if (transportType === 'stdio') {
    if (!options.mcpCommand) {
      throw new Error(
        'stdio transport requires --mcp-command <cmd>. ' +
          'Example: --mcp-command arduino-mcp-server'
      );
    }
    const args = options.mcpArgs ? options.mcpArgs.split(' ') : [];
    return { type: 'stdio', command: options.mcpCommand, args };
  }

  if (transportType === 'sse' || transportType === 'streamable-http') {
    if (!options.mcpUrl) {
      throw new Error(`${transportType} transport requires --mcp-url <url>.`);
    }
    return { type: transportType as 'sse' | 'streamable-http', url: options.mcpUrl };
  }

  throw new Error(
    `Unknown transport type: ${transportType}. Valid values: stdio, sse, streamable-http`
  );
}

const program = new Command();

program
  .name('run-suite')
  .description('Run MCP agent evaluation suite')
  .option('--suite <name>', 'suite name', 'pilot')
  .option('--pack <name>', 'benchmark pack id (e.g., arduino, general)', 'arduino')
  .option('--server <name>', 'MCP server identifier', 'arduino-mcp-local')
  .option('--model <name>', 'model identifier', 'chatgpt-or-claude')
  .option('--cases <path>', 'path to eval cases (defaults to selected pack path)')
  .option('--out <path>', 'output report path', 'reports/run-report.json')
  .option('--team <name>', 'team label for shared dashboard', 'default')
  .option('--submitted-by <name>', 'person or runner label', 'local-user')
  .option('--ingest-url <url>', 'POST endpoint for report ingestion')
  .option('--ingest-key <key>', 'Bearer token for ingestion auth')
  .option('--dry-run', 'run with dry-run MCP adapter (no live server needed)', false)
  .option(
    '--transport <type>',
    'MCP transport type: stdio | sse | streamable-http (default: stdio)'
  )
  .option(
    '--mcp-command <cmd>',
    'command to launch MCP server process (stdio transport)'
  )
  .option(
    '--mcp-args <args>',
    'space-separated arguments for MCP server command (stdio transport)'
  )
  .option(
    '--mcp-url <url>',
    'URL of running MCP server (sse or streamable-http transport)'
  )
  .action(async (options) => {
    const workspaceRoot = process.env.INIT_CWD ?? process.cwd();
    const reportPath = resolve(workspaceRoot, options.out);
    const benchmarkPack = options.pack as BenchmarkPack;
    const defaultCasesPath = getBenchmarkPackConfig(benchmarkPack).defaultCasesPath;
    const casesPath = resolve(workspaceRoot, options.cases ?? defaultCasesPath);
    mkdirSync(dirname(reportPath), { recursive: true });

    const mcpTransportConfig = buildTransportConfig({
      transport: options.transport,
      mcpCommand: options.mcpCommand,
      mcpArgs: options.mcpArgs,
      mcpUrl: options.mcpUrl,
      dryRun: Boolean(options.dryRun)
    });

    const report = await runSuite({
      suiteName: options.suite,
      benchmarkPack,
      serverName: options.server,
      modelName: options.model,
      casesPath,
      dryRun: Boolean(options.dryRun),
      deterministicWeight: 0.7,
      mcpTransportConfig
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
