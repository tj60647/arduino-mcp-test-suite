import { NextResponse } from 'next/server';
import { checkAdminAuthHeader } from '@/lib/apiAuth';
import { revokeWorkerToken, rotateWorkerToken } from '@/lib/workerRegistryStore';

export async function POST(
  request: Request,
  context: { params: Promise<{ workerId: string }> }
) {
  if (!checkAdminAuthHeader(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = await context.params;
  const workerId = params.workerId?.trim();
  if (!workerId) {
    return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
  }

  try {
    const rotated = await rotateWorkerToken(workerId);
    return NextResponse.json(rotated, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 404 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ workerId: string }> }
) {
  if (!checkAdminAuthHeader(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = await context.params;
  const workerId = params.workerId?.trim();
  if (!workerId) {
    return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
  }

  try {
    const revoked = await revokeWorkerToken(workerId);
    return NextResponse.json(revoked, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 404 }
    );
  }
}
