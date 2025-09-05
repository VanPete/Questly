import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

function parseISODate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

function* dateRange(start: Date, end: Date): Generator<string> {
  const d = new Date(start.getTime());
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export async function POST(request: Request) {
  // Protection: require cron secret in prod; in dev allow authenticated users
  const headers = request.headers;
  const cronHeader = headers.get('x-vercel-cron');
  const secretHeader = headers.get('x-cron-secret');
  if (!(cronHeader || (process.env.CRON_SECRET && secretHeader === process.env.CRON_SECRET))) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const startStr = body.start as string | undefined;
  const endStr = body.end as string | undefined;
  if (!startStr || !endStr) return NextResponse.json({ error: 'start and end required (YYYY-MM-DD)' }, { status: 400 });
  const start = parseISODate(startStr);
  const end = parseISODate(endStr);
  if (!start || !end || start > end) return NextResponse.json({ error: 'invalid date range' }, { status: 400 });

  const supabase = await getServerClient();
  const { data: topics, error: topicsErr } = await supabase
    .from('topics')
    .select('id,difficulty')
    .eq('is_active', true)
    .limit(5000);
  if (topicsErr) return NextResponse.json({ error: topicsErr.message }, { status: 500 });
  const byDiff: Record<'Beginner'|'Intermediate'|'Advanced', string[]> = { Beginner: [], Intermediate: [], Advanced: [] };
  (topics as Array<{ id: string; difficulty: 'Beginner'|'Intermediate'|'Advanced' }> | null || []).forEach((t) => {
    if (t.difficulty === 'Beginner') byDiff.Beginner.push(t.id);
    else if (t.difficulty === 'Intermediate') byDiff.Intermediate.push(t.id);
    else if (t.difficulty === 'Advanced') byDiff.Advanced.push(t.id);
  });
  // Deterministic order per difficulty using md5-like hash on id
  const sortDet = (arr: string[]) => arr.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const B = sortDet(byDiff.Beginner);
  const I = sortDet(byDiff.Intermediate);
  const A = sortDet(byDiff.Advanced);
  if (B.length === 0 || I.length === 0 || A.length === 0) {
    return NextResponse.json({ error: 'need at least one active topic per difficulty' }, { status: 400 });
  }

  const upserts: Array<{ date: string; beginner_id: string; intermediate_id: string; advanced_id: string; premium_extra_ids: string[] }> = [];
  let count = 0;
  for (const d of dateRange(start, end)) {
    const dayIndex = count++;
    const bPrim = B[dayIndex % B.length];
    const iPrim = I[dayIndex % I.length];
    const aPrim = A[dayIndex % A.length];
    const bExtra = B.length > 1 ? B[(dayIndex + 1) % B.length] : bPrim;
    const iExtra = I.length > 1 ? I[(dayIndex + 1) % I.length] : iPrim;
    const aExtra = A.length > 1 ? A[(dayIndex + 1) % A.length] : aPrim;
    const extras: string[] = [];
    if (bExtra !== bPrim) extras.push(bExtra);
    if (iExtra !== iPrim) extras.push(iExtra);
    if (aExtra !== aPrim) extras.push(aExtra);
    // If any extras equal primaries due to small pool, leave fewer than 3 extras; GET will fill deterministically
    upserts.push({ date: d, beginner_id: bPrim, intermediate_id: iPrim, advanced_id: aPrim, premium_extra_ids: extras });
  }

  // Batch upsert in chunks to stay under limits
  const chunkSize = 500;
  for (let i = 0; i < upserts.length; i += chunkSize) {
    const slice = upserts.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('daily_topics')
      .upsert(slice, { onConflict: 'date' });
    if (error) return NextResponse.json({ error: error.message, at: i }, { status: 500 });
  }

  return NextResponse.json({ ok: true, days: upserts.length });
}

export async function GET(request: Request) {
  // Convenience GET with query params for manual triggering in dev
  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  return POST(new Request(url.toString(), {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ start, end })
  }));
}
