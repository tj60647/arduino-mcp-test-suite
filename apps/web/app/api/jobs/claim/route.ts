import { NextResponse } from 'next/server';
import { checkAuthHeader } from '@/lib/apiAuth';
import { claimNextQueuedJob } from '@/lib/jobStore';
import { claimJobSchema } from '@/lib/jobValidation';

export async function POST(request: Request) {
  if (!checkAuthHeader(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = claimJobSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const job = await claimNextQueuedJob(parsed.data.workerId);
  if (!job) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({ job });
}
