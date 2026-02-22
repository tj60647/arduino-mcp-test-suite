import { z } from 'zod';

export const runReportSchema = z.object({
  runId: z.string().min(1),
  suiteName: z.string().min(1),
  benchmarkPack: z.string().min(1).default('general'),
  server: z.string().min(1),
  model: z.string().min(1),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  summary: z.object({
    passed: z.number(),
    failed: z.number(),
    score: z.number(),
    deterministicScore: z.number(),
    epistemicScore: z.number()
  }),
  cases: z.array(z.object({
    id: z.string(),
    title: z.string(),
    category: z.enum(['deterministic', 'epistemic', 'safety']),
    passed: z.boolean(),
    deterministicScore: z.number(),
    epistemicScore: z.number(),
    notes: z.array(z.string())
  }))
});

export const ingestPayloadSchema = z.object({
  team: z.string().min(1).default('default'),
  submittedBy: z.string().min(1).default('unknown'),
  report: runReportSchema
});
