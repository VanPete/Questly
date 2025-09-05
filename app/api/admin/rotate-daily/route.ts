import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';
import { currentUser } from '@clerk/nextjs/server';
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
  let free_beginner_id: string | undefined;
  let free_intermediate_id: string | undefined;
  let free_advanced_id: string | undefined;
  if (topics && topics.length >= 3) {
    const pickRand = (diff: string) => {
      const c = (topics as Array<{ id: string; difficulty: string }>).filter(t => t.difficulty === diff);
      if (c.length === 0) return undefined;
      const idx = Math.floor(Math.random() * c.length);
      return c[idx]?.id;
    };
  free_beginner_id = pickRand('Beginner');
  free_intermediate_id = pickRand('Intermediate');
  free_advanced_id = pickRand('Advanced');
  } else {
    const pickDemo = (diff: string) => {
      const c = demoTopics.filter(t => t.difficulty === diff);
      if (c.length === 0) return undefined;
      const idx = Math.floor(Math.random() * c.length);
      return c[idx]?.id;
    };
  free_beginner_id = pickDemo('Beginner');
  free_intermediate_id = pickDemo('Intermediate');
  free_advanced_id = pickDemo('Advanced');
  }
  if (!free_beginner_id || !free_intermediate_id || !free_advanced_id) return NextResponse.json({ error: 'missing seeds' }, { status: 400 });
  // Pick premium counterparts (must differ per difficulty). Prefer active topics; fallback to demo.
  function pickDifferent(diff: string, avoid: string | undefined): string | undefined {
    const pool = (topics as Array<{ id: string; difficulty: string }> | null || [])
      .filter(t => t.difficulty === diff && t.id !== avoid)
      .map(t => t.id);
    if (pool.length === 0) {
      const demoPool = demoTopics.filter(t => t.difficulty === diff && t.id !== avoid).map(t => t.id);
      if (demoPool.length === 0) return undefined;
      return demoPool[Math.floor(Math.random() * demoPool.length)];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const premium_beginner_id = pickDifferent('Beginner', free_beginner_id);
  const premium_intermediate_id = pickDifferent('Intermediate', free_intermediate_id);
  const premium_advanced_id = pickDifferent('Advanced', free_advanced_id);
  if (!premium_beginner_id || !premium_intermediate_id || !premium_advanced_id) {
    return NextResponse.json({ error: 'insufficient topic pool to choose distinct premium variants' }, { status: 400 });
  }

  const { error } = await supabase
    .from('daily_topics')
    .upsert({
      date: today,
      free_beginner_id,
      free_intermediate_id,
      free_advanced_id,
      premium_beginner_id,
      premium_intermediate_id,
      premium_advanced_id,
    }, { onConflict: 'date' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, date: today, ids: { free_beginner_id, free_intermediate_id, free_advanced_id, premium_beginner_id, premium_intermediate_id, premium_advanced_id } });
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
  const u = await currentUser();
  if (!u?.id) return NextResponse.json({ error: 'auth required' }, { status: 401 });
  return rotate();
}

export async function POST(request: Request) {
  return GET(request);
}
