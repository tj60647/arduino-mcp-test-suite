import { NextResponse } from 'next/server';
import { join } from 'node:path';
import { runSuite } from '../../../../../packages/runner/dist/index.js';
import { connectMcp } from '../../../../../packages/runner/dist/mcpClient.js';
import { addRun } from '@/lib/store';

export const runtime = 'nodejs';

type QuickRunPayload = {
  team: string;
  submittedBy: string;
  config: {
    suiteName: string;
    benchmarkPack: 'general';
    serverName: string;
    modelName: string;
    dryRun: boolean;
    deterministicWeight: number;
    mcpTransportConfig?:
      | { type: 'stdio'; command: string; args: string[] }
      | { type: 'sse' | 'streamable-http'; url: string };
  };
};

function isQuickRunPayload(value: unknown): value is QuickRunPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<QuickRunPayload>;
  const config = payload.config;

  if (!config || typeof config !== 'object') {
    return false;
  }

  return (
    typeof payload.team === 'string' &&
    payload.team.length > 0 &&
    typeof payload.submittedBy === 'string' &&
    payload.submittedBy.length > 0 &&
    config.benchmarkPack === 'general' &&
    typeof config.suiteName === 'string' &&
    config.suiteName.length > 0 &&
    typeof config.serverName === 'string' &&
    config.serverName.length > 0 &&
    typeof config.modelName === 'string' &&
    config.modelName.length > 0 &&
    typeof config.dryRun === 'boolean' &&
    typeof config.deterministicWeight === 'number'
  );
}

export async function POST(request: Request) {
  const payload = (await request.json()) as unknown;

  if (!isQuickRunPayload(payload)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  try {
    let discoveredCapabilities: string[] = [];

    if (!payload.config.dryRun) {
      const probeSession = await connectMcp(
        payload.config.serverName,
        false,
        payload.config.mcpTransportConfig
      );
      discoveredCapabilities = [...probeSession.availableCapabilities].sort();
      await probeSession.close();
    }

    const casesPath = join(process.cwd(), '..', '..', 'cases', 'general');

    const report = await runSuite({
      suiteName: payload.config.suiteName,
      benchmarkPack: payload.config.benchmarkPack,
      serverName: payload.config.serverName,
      modelName: payload.config.modelName,
      casesPath,
      dryRun: payload.config.dryRun,
      deterministicWeight: payload.config.deterministicWeight,
      mcpTransportConfig: payload.config.mcpTransportConfig
    });

    const stored = await addRun({
      team: payload.team,
      submittedBy: payload.submittedBy,
      report
    });

    return NextResponse.json(
      {
        runId: stored.id,
        summary: report.summary,
        connectivity: payload.config.dryRun
          ? { mode: 'dry-run' as const }
          : {
              mode: 'live' as const,
              connected: true,
              discoveredCapabilities
            }
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Quick run failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
