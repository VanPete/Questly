import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';
import { demoTopics } from '@/lib/demoData';

// POST /api/admin/rotate-daily
// Simple daily seed from demo topics (Beginner/Intermediate/Advanced) for today.
// Protection:
// - If invoked by Vercel Cron, requests include the 'x-vercel-cron' header.
// - Optionally allow a shared secret header 'x-cron-secret' that must match CRON_SECRET.
// - Otherwise require an authenticated user (manual/admin run from browser).

async function rotate() {
  const today = new Date().toISOString().slice(0, 10);
  const pick = (diff: string) => demoTopics.find(t => t.difficulty === diff)?.id;
  const beginner_id = pick('Beginner');
  const intermediate_id = pick('Intermediate');
  const advanced_id = pick('Advanced');
  if (!beginner_id || !intermediate_id || !advanced_id) return NextResponse.json({ error: 'missing seeds' }, { status: 400 });
  const supabase = await getServerClient();
  const { error } = await supabase
    .from('daily_topics')
    .upsert({ date: today, beginner_id, intermediate_id, advanced_id, premium_extra_ids: [] }, { onConflict: 'date' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, date: today, ids: { beginner_id, intermediate_id, advanced_id } });
}

export async function GET(request: Request) {
  const headers = request.headers;
  const cronHeader = headers.get('x-vercel-cron');
  const secretHeader = headers.get('x-cron-secret');
  if (cronHeader || (process.env.CRON_SECRET && secretHeader === process.env.CRON_SECRET)) {
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
