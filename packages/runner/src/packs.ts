import type { BenchmarkPack, Capability } from '@mcp-agent-eval/schemas';

export interface BenchmarkPackConfig {
  id: BenchmarkPack;
  defaultCasesPath: string;
  capabilityAliases: Record<string, Capability>;
}

const generalAliases: Record<string, Capability> = {
  compile: 'build',
  upload: 'run',
  simulate: 'test',
  serial_read: 'device_io',
  serial_write: 'device_io'
};

export const BENCHMARK_PACKS: Record<BenchmarkPack, BenchmarkPackConfig> = {
  general: {
    id: 'general',
    defaultCasesPath: 'cases/general',
    capabilityAliases: generalAliases
  }
};

export function getBenchmarkPackConfig(pack: BenchmarkPack): BenchmarkPackConfig {
  return BENCHMARK_PACKS[pack];
}
