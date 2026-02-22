import { NextResponse } from 'next/server';
import { appendJobEvent } from '@/lib/jobStore';
import { authorizeWorkerRequest } from '@/lib/workerAuth';
import { appendJobEventSchema } from '@/lib/jobValidation';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeWorkerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = appendJobEventSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const params = await context.params;
  const job = await appendJobEvent(params.id, {
    at: new Date().toISOString(),
    level: parsed.data.level,
    message: parsed.data.message
  });

  if (!job) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ id: job.id, updatedAt: job.updatedAt, events: job.events.length });
}
