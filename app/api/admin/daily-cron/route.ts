import { NextResponse } from 'next/server';

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

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

async function runDailyTasks() {
  const base = getBaseUrl();
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) headers['x-cron-secret'] = process.env.CRON_SECRET;
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

  // 2) Rotate daily topics (force within the window)
  try {
    const res = await fetch(`${base}/api/admin/rotate-daily?force=1`, { headers, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    results.rotate_daily = { status: res.status, body: json };
  } catch (e) {
    results.rotate_daily = { error: String(e) };
  }

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
  const results = await runDailyTasks();
  return NextResponse.json({ ok: true, ...results });
}

export async function POST(request: Request) {
  return GET(request);
}
