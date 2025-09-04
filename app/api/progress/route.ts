import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// POST /api/progress { date, topic_id, quick_correct, quiz_score, quiz_total, completed }
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  let supabase: SupabaseClient = await getServerClient() as unknown as SupabaseClient;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    }
  }
  const body = await request.json();
  const { date, topic_id, quick_correct, quiz_score, quiz_total, completed } = body as {
    date?: string; topic_id?: string; quick_correct?: boolean; quiz_score?: number; quiz_total?: number; completed?: boolean;
  };
  if (!date || !topic_id) return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  if (quiz_score != null && quiz_total != null && (quiz_score < 0 || quiz_total <= 0 || quiz_score > quiz_total)) {
    return NextResponse.json({ error: 'invalid score' }, { status: 400 });
  }

  // Auth user
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  // Upsert progress
  const { error: perr } = await supabase.from('user_progress').upsert({
    user_id: userId, date, topic_id, quick_correct: !!quick_correct, quiz_score: quiz_score ?? null, quiz_total: quiz_total ?? null, completed: !!completed,
  });
  if (perr) return NextResponse.json({ error: perr.message }, { status: 500 });

  // Compute points
  // Base points: 10 per correct answer
  const correctPoints = Math.max(0, (quiz_score ?? 0)) * 10;
  let bonus = 0;
  try {
    // Check if all 3 completed today (beginner/intermediate/advanced any trio)
    const { data: todays } = await supabase
      .from('user_progress')
      .select('topic_id, completed')
      .eq('user_id', userId)
      .eq('date', date);
    const completedCount = (todays || []).filter(r => r.completed).length;
    if (completedCount >= 3) bonus = 50;
  } catch {}

  // Streak multiplier
  let multiplier = 1;
  try {
    type PointsRow = { streak: number | null; last_active_date: string | null; total_points: number | null; longest_streak: number | null } | null;
    const { data: pts } = await supabase
      .from('user_points')
      .select('streak, last_active_date, total_points, longest_streak')
      .eq('user_id', userId)
      .maybeSingle() as unknown as { data: PointsRow };
    const lastDate = pts?.last_active_date ?? undefined;
    const last = lastDate ? new Date(lastDate) : null;
    const today = new Date(date + 'T00:00:00Z');
    const days = last ? Math.floor((+today - +new Date(last.toISOString().slice(0,10)+'T00:00:00Z')) / 86400000) : undefined;
    let streak = pts?.streak ?? 0;
    if (days === 0) {
      // no change
    } else if (days === 1 || last === null) {
      streak = Math.max(1, streak + 1);
    } else {
      streak = 1; // reset (streak insurance handled later via premium)
    }
    multiplier = Math.min(2, 1 + 0.1 * Math.max(0, streak - 1));
  const gained = Math.round((correctPoints + bonus) * multiplier);
    const totalInc = gained;
  const prevTotal = typeof (pts?.total_points ?? null) === 'number' ? (pts!.total_points as number) : 0;
  const prevLongest = typeof (pts?.longest_streak ?? null) === 'number' ? (pts!.longest_streak as number) : 0;
    const longest = Math.max(prevLongest, streak);
    await supabase.from('user_points').upsert({
      user_id: userId,
      total_points: prevTotal + totalInc,
      streak,
      longest_streak: longest,
      last_active_date: date,
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ points_gained: gained, bonus, multiplier, streak });
  } catch {
    // Fallback: no multiplier update
  const gained = correctPoints + bonus;
  return NextResponse.json({ points_gained: gained, bonus, multiplier: 1 });
  }
}
