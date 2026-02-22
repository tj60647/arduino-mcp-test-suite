import { z } from 'zod';

export const benchmarkPackSchema = z.enum(['arduino', 'general']);

export const capabilitySchema = z.enum([
  'file_read',
  'project_init',
  'file_write',
  'shell_exec',
  'http_request',
  'build',
  'run',
  'test',
  'device_io',
  'compile',
  'upload',
  'simulate',
  'serial_read',
  'serial_write',
  'dependency_install'
]);

export const objectiveCheckSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['requires_capability', 'requires_prompt_contains', 'requires_question']),
  value: z.string().min(1),
  required: z.boolean().default(true),
  weight: z.number().min(0).max(1).default(0.2)
});

export const epistemicCriterionSchema = z.object({
  id: z.string().min(1),
  label: z.enum([
    'calibration',
    'clarification',
    'evidence_use',
    'constraint_consistency',
    'safety_awareness'
  ]),
  description: z.string().min(1),
  weight: z.number().min(0).max(1).default(0.2)
});

export const evalCaseSchema = z.object({
  schemaVersion: z.literal('0.1.0'),
  benchmarkPack: benchmarkPackSchema.default('arduino'),
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(['deterministic', 'epistemic', 'safety']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string().min(1)).min(1),
  prompt: z.string().min(1),
  context: z.object({
    board: z.string().optional(),
    constraints: z.array(z.string()),
    assumptionsAllowed: z.boolean()
  }),
  requiredCapabilities: z.array(capabilitySchema).min(1),
  objectiveChecks: z.array(objectiveCheckSchema).min(1),
  epistemicRubric: z.array(epistemicCriterionSchema).optional()
});

// ─── MCP transport configuration ─────────────────────────────────────────────

export const mcpTransportConfigSchema = z.discriminatedUnion('type', [
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

export const runConfigSchema = z.object({
  suiteName: z.string().default('pilot'),
  benchmarkPack: benchmarkPackSchema.default('arduino'),
  serverName: z.string().min(1),
  modelName: z.string().min(1),
  casesPath: z.string().min(1),
  dryRun: z.boolean().default(false),
  deterministicWeight: z.number().min(0).max(1).default(0.7),
  mcpTransportConfig: mcpTransportConfigSchema.optional()
});

// ─── Run trace events ─────────────────────────────────────────────────────────

export const runTraceEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session_connected'),
    timestamp: z.string().datetime(),
    serverName: z.string(),
    capabilities: z.array(capabilitySchema)
  }),
  z.object({
    type: z.literal('turn_start'),
    timestamp: z.string().datetime(),
    turn: z.number().int().min(0),
    prompt: z.string()
  }),
  z.object({
    type: z.literal('tool_call'),
    timestamp: z.string().datetime(),
    turn: z.number().int().min(0),
    toolName: z.string(),
    parameters: z.record(z.unknown())
  }),
  z.object({
    type: z.literal('tool_result'),
    timestamp: z.string().datetime(),
    turn: z.number().int().min(0),
    toolName: z.string(),
    result: z.unknown(),
    errorMessage: z.string().optional()
  }),
  z.object({
    type: z.literal('model_response'),
    timestamp: z.string().datetime(),
    turn: z.number().int().min(0),
    content: z.string(),
    finishReason: z.enum(['stop', 'tool_use', 'max_turns', 'error'])
  }),
  z.object({
    type: z.literal('check_result'),
    timestamp: z.string().datetime(),
    checkId: z.string(),
    passed: z.boolean(),
    score: z.number(),
    note: z.string().optional()
  }),
  z.object({
    type: z.literal('session_closed'),
    timestamp: z.string().datetime(),
    totalTurns: z.number().int().min(0)
  })
]);

export type Capability = z.infer<typeof capabilitySchema>;
export type BenchmarkPack = z.infer<typeof benchmarkPackSchema>;
export type ObjectiveCheck = z.infer<typeof objectiveCheckSchema>;
export type EpistemicCriterion = z.infer<typeof epistemicCriterionSchema>;
export type EvalCase = z.infer<typeof evalCaseSchema>;
export type McpTransportConfig = z.infer<typeof mcpTransportConfigSchema>;
export type RunConfig = z.infer<typeof runConfigSchema>;
export type RunTraceEvent = z.infer<typeof runTraceEventSchema>;
