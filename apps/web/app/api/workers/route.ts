import { NextResponse } from 'next/server';
import { listWorkers, upsertWorkerHeartbeat } from '@/lib/workerStore';
import { authorizeWorkerRequest } from '@/lib/workerAuth';
import { workerHeartbeatSchema } from '@/lib/workerValidation';

export async function GET() {
  const workers = await listWorkers();
  return NextResponse.json({ workers });
}

export async function POST(request: Request) {
  const auth = await authorizeWorkerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = workerHeartbeatSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (auth.mode === 'worker-token' && auth.workerId !== parsed.data.workerId) {
    return NextResponse.json({ error: 'workerId header/body mismatch' }, { status: 403 });
  }

  const worker = await upsertWorkerHeartbeat(parsed.data);
  return NextResponse.json({ worker }, { status: 200 });
}
