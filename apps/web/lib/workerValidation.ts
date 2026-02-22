import { z } from 'zod';

export const workerHeartbeatSchema = z.object({
  workerId: z.string().min(1),
  status: z.enum(['idle', 'busy']),
  currentJobId: z.string().min(1).optional(),
  host: z.string().min(1).optional(),
  version: z.string().min(1).optional()
});
