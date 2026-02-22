import { z } from 'zod';
import { runReportSchema } from './validation';

const transportConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string().min(1),
    args: z.array(z.string()).default([])
  }),
  z.object({
    type: z.literal('sse'),
    url: z.string().url()
  }),
  z.object({
    type: z.literal('streamable-http'),
    url: z.string().url()
  })
]);

export const createJobSchema = z.object({
  team: z.string().min(1).default('default'),
  submittedBy: z.string().min(1).default('unknown'),
  config: z.object({
    suiteName: z.string().min(1).default('general'),
    benchmarkPack: z.literal('general').default('general'),
    serverName: z.string().min(1),
    modelName: z.string().min(1),
    casesPath: z.string().min(1).optional(),
    dryRun: z.boolean().default(false),
    deterministicWeight: z.number().min(0).max(1).default(0.7),
    mcpTransportConfig: transportConfigSchema.optional()
  })
});

export const claimJobSchema = z.object({
  workerId: z.string().min(1)
});

export const appendJobEventSchema = z.object({
  level: z.enum(['info', 'warning', 'error']).default('info'),
  message: z.string().min(1)
});

export const completeJobSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('completed'),
    report: runReportSchema,
    team: z.string().min(1),
    submittedBy: z.string().min(1)
  }),
  z.object({
    status: z.literal('failed'),
    errorMessage: z.string().min(1)
  })
]);
