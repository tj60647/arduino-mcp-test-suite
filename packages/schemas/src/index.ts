import { z } from 'zod';

export const capabilitySchema = z.enum([
  'project_init',
  'file_write',
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

export const runConfigSchema = z.object({
  suiteName: z.string().default('pilot'),
  serverName: z.string().min(1),
  modelName: z.string().min(1),
  casesPath: z.string().min(1),
  dryRun: z.boolean().default(false),
  deterministicWeight: z.number().min(0).max(1).default(0.7)
});

export type Capability = z.infer<typeof capabilitySchema>;
export type ObjectiveCheck = z.infer<typeof objectiveCheckSchema>;
export type EpistemicCriterion = z.infer<typeof epistemicCriterionSchema>;
export type EvalCase = z.infer<typeof evalCaseSchema>;
export type RunConfig = z.infer<typeof runConfigSchema>;
