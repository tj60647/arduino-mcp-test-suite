import { NextResponse } from 'next/server';
import { addRun, clearRuns, listRuns } from '@/lib/store';
import { checkAuthHeader } from '@/lib/apiAuth';
import { ingestPayloadSchema } from '@/lib/validation';

export async function GET() {
  const runs = await listRuns();
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  if (!checkAuthHeader(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = ingestPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const stored = await addRun(parsed.data);
  return NextResponse.json({ id: stored.id, createdAt: stored.createdAt }, { status: 201 });
}

export async function DELETE() {
  await clearRuns();
  return NextResponse.json({ ok: true });
}
