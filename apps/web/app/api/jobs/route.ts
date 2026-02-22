import { NextResponse } from 'next/server';
import { checkAuthHeader } from '@/lib/apiAuth';
import { createJob, listJobs } from '@/lib/jobStore';
import { createJobSchema } from '@/lib/jobValidation';

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  if (!checkAuthHeader(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = createJobSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const job = await createJob(parsed.data);
  return NextResponse.json({ id: job.id, status: job.status, createdAt: job.createdAt }, { status: 201 });
}
