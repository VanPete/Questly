import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getBaseUrl } from '@/lib/baseUrl';

function todayInTimeZoneISODate(tz: string) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

function isoDateMinusDays(dateYYYYMMDD: string, days: number): string {
  const d = new Date(dateYYYYMMDD + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}


async function runDailyTasks() {
  const base = getBaseUrl();
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) headers['x-cron-secret'] = process.env.CRON_SECRET;
  // Simulate Vercel Cron so guarded routes accept this internal call in production
  headers['x-vercel-cron'] = '1';
  headers['content-type'] = 'application/json';

  const results: Record<string, unknown> = {};

  // 1) Import topics (idempotent)
  try {
    const res = await fetch(`${base}/api/admin/import-topics`, { method: 'POST', headers, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    results.import_topics = { status: res.status, body: json };
  } catch (e) {
    results.import_topics = { error: String(e) };
  }

  // (Rotation now handled in the GET handler so we can skip if a schedule row already exists)

  // 3) Snapshot leaderboard for the just-finished ET day
  try {
    const todayET = todayInTimeZoneISODate('America/New_York');
    const snapshotDate = isoDateMinusDays(todayET, 1);
    const res = await fetch(`${base}/api/admin/snapshot-leaderboard?date=${snapshotDate}`, { headers, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    results.snapshot_leaderboard = { status: res.status, body: json };
  } catch (e) {
    results.snapshot_leaderboard = { error: String(e) };
  }

  return results;
}

export async function GET(request: Request) {
  const headers = request.headers;
  const cronHeader = headers.get('x-vercel-cron');
  const secretHeader = headers.get('x-cron-secret');
  if (!(cronHeader || (process.env.CRON_SECRET && secretHeader === process.env.CRON_SECRET))) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(request.url);
  const replace = url.searchParams.get('replace') === '1';
  const todayET = todayInTimeZoneISODate('America/New_York');

  // Determine if a pre-generated schedule row exists for today. If so, skip rotate unless replace=1 was passed.
  let rotateResult: Record<string, unknown> = { skipped: true, reason: 'not attempted' };
  try {
    const admin = getAdminClient();
    const { data: existing } = await admin
      .from('daily_topics')
      .select('date')
      .eq('date', todayET)
      .maybeSingle();
    if (existing && !replace) {
      rotateResult = { skipped: true, reason: 'schedule row already exists for date', date: todayET };
    } else {
  const base = getBaseUrl();
      const rotateHeaders: Record<string, string> = {};
      if (process.env.CRON_SECRET) rotateHeaders['x-cron-secret'] = process.env.CRON_SECRET;
      rotateHeaders['x-vercel-cron'] = '1';
      try {
        const res = await fetch(`${base}/api/admin/rotate-daily?force=1`, { headers: rotateHeaders, cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        rotateResult = { status: res.status, body: json };
      } catch (e) {
        rotateResult = { error: String(e) };
      }
    }
  } catch (e) {
    rotateResult = { error: 'rotate check failed', detail: String(e) };
  }

  const results = await runDailyTasks();
  return NextResponse.json({ ok: true, rotate_daily: rotateResult, ...results });
}

export async function POST(request: Request) {
  return GET(request);
}
