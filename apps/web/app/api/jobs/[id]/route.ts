import { NextResponse } from 'next/server';
import { getJob } from '@/lib/jobStore';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const job = await getJob(params.id);
  if (!job) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ job });
}
