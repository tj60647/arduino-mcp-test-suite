import { NextResponse } from 'next/server';
import { completeJob } from '@/lib/jobStore';
import { completeJobSchema } from '@/lib/jobValidation';
import { addRun } from '@/lib/store';
import { authorizeWorkerRequest } from '@/lib/workerAuth';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeWorkerRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = completeJobSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const params = await context.params;

  if (parsed.data.status === 'failed') {
    const job = await completeJob({
      jobId: params.id,
      status: 'failed',
      errorMessage: parsed.data.errorMessage
    });

    if (!job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ id: job.id, status: job.status, finishedAt: job.finishedAt });
  }

  const storedRun = await addRun({
    team: parsed.data.team,
    submittedBy: parsed.data.submittedBy,
    report: parsed.data.report
  });

  const job = await completeJob({
    jobId: params.id,
    status: 'completed',
    reportId: storedRun.id
  });

  if (!job) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    finishedAt: job.finishedAt,
    reportId: storedRun.id
  });
}
