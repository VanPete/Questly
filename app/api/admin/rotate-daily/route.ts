import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';
import { demoTopics } from '@/lib/demoData';

// POST /api/admin/rotate-daily
// Simple daily seed from demo topics (Beginner/Intermediate/Advanced) for today.
// Protection:
// - If invoked by Vercel Cron, requests include the 'x-vercel-cron' header.
// - Optionally allow a shared secret header 'x-cron-secret' that must match CRON_SECRET.
// - Otherwise require an authenticated user (manual/admin run from browser).

function todayInTimeZoneISODate(tz: string) {
  // Reliable YYYY-MM-DD in given tz without external deps
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA yields YYYY-MM-DD
  return fmt.format(now);
}

function tzHour(tz: string): number {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false });
  const parts = (fmt as unknown as { formatToParts: (d: Date) => Intl.DateTimeFormatPart[] }).formatToParts(now);
  const hourStr = parts.find((p) => p.type === 'hour')?.value || '0';
  return parseInt(hourStr, 10);
}

async function rotate() {
  // Compute date in America/New_York to handle DST and cron timing correctly
  const today = todayInTimeZoneISODate('America/New_York');
  const supabase = await getServerClient();
  // Prefer canonical topics if present
  const { data: topics, error: topicsErr } = await supabase
    .from('topics')
    .select('id, difficulty')
    .eq('is_active', true)
    .limit(3000);
  if (topicsErr) return NextResponse.json({ error: topicsErr.message }, { status: 500 });
  let beginner_id: string | undefined;
  let intermediate_id: string | undefined;
  let advanced_id: string | undefined;
  if (topics && topics.length >= 3) {
    const pickRand = (diff: string) => {
      const c = (topics as Array<{ id: string; difficulty: string }>).filter(t => t.difficulty === diff);
      if (c.length === 0) return undefined;
      const idx = Math.floor(Math.random() * c.length);
      return c[idx]?.id;
    };
    beginner_id = pickRand('Beginner');
    intermediate_id = pickRand('Intermediate');
    advanced_id = pickRand('Advanced');
  } else {
    const pickDemo = (diff: string) => {
      const c = demoTopics.filter(t => t.difficulty === diff);
      if (c.length === 0) return undefined;
      const idx = Math.floor(Math.random() * c.length);
      return c[idx]?.id;
    };
    beginner_id = pickDemo('Beginner');
    intermediate_id = pickDemo('Intermediate');
    advanced_id = pickDemo('Advanced');
  }
  if (!beginner_id || !intermediate_id || !advanced_id) return NextResponse.json({ error: 'missing seeds' }, { status: 400 });
  // Build premium extras: 1 per difficulty (exclude the chosen primary id) → total 6 tiles for premium
  const extras: string[] = [];
  if (topics && topics.length >= 3) {
    const byDiff: Record<string, string[]> = { Beginner: [], Intermediate: [], Advanced: [] };
    for (const t of topics as Array<{ id: string; difficulty: string }>) {
      if (t.difficulty === 'Beginner' && t.id !== beginner_id) byDiff.Beginner.push(t.id);
      if (t.difficulty === 'Intermediate' && t.id !== intermediate_id) byDiff.Intermediate.push(t.id);
      if (t.difficulty === 'Advanced' && t.id !== advanced_id) byDiff.Advanced.push(t.id);
    }
    const pickN = (arr: string[], n: number) => {
      const out: string[] = [];
      const used = new Set<number>();
      const count = Math.min(n, arr.length);
      while (out.length < count) {
        const idx = Math.floor(Math.random() * arr.length);
        if (used.has(idx)) continue;
        used.add(idx);
        out.push(arr[idx]);
      }
      return out;
    };
    extras.push(...pickN(byDiff.Beginner, 1), ...pickN(byDiff.Intermediate, 1), ...pickN(byDiff.Advanced, 1));
  } else {
    // Fallback to demo extras: 1 per difficulty
    const pickExtras = (diff: string) => {
      const pool = demoTopics.filter(t => t.difficulty === diff).map(t => t.id).filter(id => id !== (diff === 'Beginner' ? beginner_id : diff === 'Intermediate' ? intermediate_id : advanced_id));
      const out: string[] = [];
      const used = new Set<number>();
      const need = Math.min(1, pool.length);
      while (out.length < need) {
        const idx = Math.floor(Math.random() * pool.length);
        if (used.has(idx)) continue;
        used.add(idx);
        out.push(pool[idx]!);
      }
      return out;
    };
    extras.push(...pickExtras('Beginner'), ...pickExtras('Intermediate'), ...pickExtras('Advanced'));
  }

  const { error } = await supabase
    .from('daily_topics')
    .upsert({ date: today, beginner_id, intermediate_id, advanced_id, premium_extra_ids: extras }, { onConflict: 'date' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, date: today, ids: { beginner_id, intermediate_id, advanced_id }, premium_extra_count: extras.length });
}

export async function GET(request: Request) {
  const headers = request.headers;
  const cronHeader = headers.get('x-vercel-cron');
  const secretHeader = headers.get('x-cron-secret');
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  if (cronHeader || (process.env.CRON_SECRET && secretHeader === process.env.CRON_SECRET)) {
    // Allow either 00:xx or 01:xx in America/New_York to handle DST with a single daily UTC cron
    const hourET = tzHour('America/New_York');
    if (!force && hourET !== 0 && hourET !== 1) {
      return NextResponse.json({ skipped: true, reason: 'outside America/New_York midnight window' }, { status: 200 });
    }
    return rotate();
  }
  // In production, only cron/secret allowed
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // In non-prod, allow authenticated user to trigger manually
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: 'auth required' }, { status: 401 });
  return rotate();
}

export async function POST(request: Request) {
  return GET(request);
}
