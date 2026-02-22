import { checkAdminAuthHeader } from './apiAuth';
import { verifyWorkerToken } from './workerRegistryStore';

export interface WorkerAuthResult {
  ok: boolean;
  mode?: 'admin' | 'worker-token';
  workerId?: string;
}

export async function authorizeWorkerRequest(request: Request): Promise<WorkerAuthResult> {
  const authHeader = request.headers.get('authorization');
  if (checkAdminAuthHeader(authHeader)) {
    return { ok: true, mode: 'admin' };
  }

  const workerId = request.headers.get('x-worker-id');
  const workerToken = request.headers.get('x-worker-token');
  if (!workerId || !workerToken) {
    return { ok: false };
  }

  const valid = await verifyWorkerToken(workerId, workerToken);
  if (!valid) {
    return { ok: false };
  }

  return { ok: true, mode: 'worker-token', workerId };
}
