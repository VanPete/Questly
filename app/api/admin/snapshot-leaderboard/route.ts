import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

function dateUTC(offsetMinutes = 0) {
  const d = new Date();
  d.setUTCMinutes(d.getUTCMinutes() + offsetMinutes);
  return d.toISOString().slice(0, 10);
}

async function compute(date: string) {
  const supabase = await getServerClient();
  // Aggregate correct answers -> points
  const { data: correctRows, error: corrErr } = await supabase
    .from('quiz_answers')
    .select('is_correct, attempt_id, quiz_attempts!inner(user_id, created_at)')
    .eq('is_correct', true);
  if (corrErr) throw new Error(corrErr.message);

  const correctCount: Record<string, number> = {};
  for (const r of correctRows ?? []) {
    const qaUnknown = (r as unknown as { quiz_attempts?: unknown }).quiz_attempts;
    const qa = qaUnknown as { user_id?: unknown; created_at?: unknown } | undefined;
    if (!qa || typeof qa.created_at !== 'string') continue;
    const d = qa.created_at.slice(0, 10);
    if (d !== date) continue;
    const uid = qa.user_id ?? null;
    if (!uid || typeof uid !== 'string') continue;
    correctCount[uid] = (correctCount[uid] || 0) + 1;
  }

  const { data: progressRows, error: progErr } = await supabase
    .from('user_progress')
    .select('user_id, topic_id, completed, date')
    .eq('date', date)
    .eq('completed', true);
  if (progErr) throw new Error(progErr.message);
  const completedTopics: Record<string, Set<string>> = {};
  for (const r of progressRows || []) {
    const uid = r.user_id as string;
    if (!completedTopics[uid]) completedTopics[uid] = new Set();
    completedTopics[uid].add(r.topic_id as string);
  }

  const entries = Object.keys({ ...correctCount, ...completedTopics }).map((uid) => {
    const correct = correctCount[uid] || 0;
    const completed = completedTopics[uid]?.size || 0;
    const bonus = completed >= 3 ? 50 : 0;
    const points = correct * 10 + bonus;
    return { user_id: uid, points };
  });

  entries.sort((a, b) => b.points - a.points);
  return entries.map((e, i) => ({ date, user_id: e.user_id, points: e.points, rank: i + 1 }));
}

async function snapshot(date: string) {
  const supabase = await getServerClient();
  const rows = await compute(date);
  if (rows.length === 0) return { ok: true, date, rows: 0 };
  const { error } = await supabase
    .from('leaderboard_daily')
    .upsert(rows, { onConflict: 'date,user_id' });
  if (error) throw new Error(error.message);
  return { ok: true, date, rows: rows.length };
}

export async function GET(request: Request) {
  const headers = request.headers;
  const cronHeader = headers.get('x-vercel-cron');
  const secretHeader = headers.get('x-cron-secret');
  const date = new URL(request.url).searchParams.get('date') || dateUTC();
  if (cronHeader || (process.env.CRON_SECRET && secretHeader === process.env.CRON_SECRET)) {
    try {
      const res = await snapshot(date);
      return NextResponse.json(res);
    } catch (e: unknown) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Non-prod: allow authenticated manual run
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: 'auth required' }, { status: 401 });
  try {
    const res = await snapshot(date);
    return NextResponse.json(res);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
