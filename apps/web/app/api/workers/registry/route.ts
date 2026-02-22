import { NextResponse } from 'next/server';
import { checkAdminAuthHeader } from '@/lib/apiAuth';
import { listRegisteredWorkers, registerWorkerToken } from '@/lib/workerRegistryStore';

export async function GET(request: Request) {
  if (!checkAdminAuthHeader(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workers = await listRegisteredWorkers();
  return NextResponse.json({ workers });
}

export async function POST(request: Request) {
  if (!checkAdminAuthHeader(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = (await request.json()) as { workerId?: string };
  const workerId = payload.workerId?.trim();
  if (!workerId) {
    return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
  }

  const registration = await registerWorkerToken(workerId);
  return NextResponse.json(registration, { status: 201 });
}
