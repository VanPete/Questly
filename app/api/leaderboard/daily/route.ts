import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || today();
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 50)));

  const supabase = await getServerClient();
  // Using two selects and merge:
  const { data: correctRows, error: corrErr } = await supabase
    .from('quiz_answers')
    .select('is_correct, attempt_id, quiz_attempts!inner(clerk_user_id, created_at)')
    .eq('is_correct', true);
  if (corrErr) return NextResponse.json({ error: corrErr.message }, { status: 500 });
  const correctCount: Record<string, number> = {};
  for (const r of correctRows ?? []) {
    const qaUnknown = (r as unknown as { quiz_attempts?: unknown }).quiz_attempts;
    const qa = qaUnknown as { clerk_user_id?: unknown; created_at?: unknown } | undefined;
    if (!qa || typeof qa.created_at !== 'string') continue;
    const d = qa.created_at.slice(0, 10);
    if (d !== date) continue;
  const uid = qa.clerk_user_id ?? null;
    if (!uid || typeof uid !== 'string') continue;
    correctCount[uid] = (correctCount[uid] || 0) + 1;
  }

  const { data: progressRows, error: progErr } = await supabase
    .from('user_progress')
    .select('clerk_user_id, topic_id, completed, date')
    .eq('date', date)
    .eq('completed', true);
  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 });
  const completedTopics: Record<string, Set<string>> = {};
  for (const r of progressRows || []) {
    const uid = r.clerk_user_id as string;
    if (!completedTopics[uid]) completedTopics[uid] = new Set();
    completedTopics[uid].add(r.topic_id as string);
  }

  // Compute points: 10 per correct + 50 bonus if 3+ topics completed
  const entries = Object.keys(correctCount).map((uid) => {
    const correct = correctCount[uid] || 0;
    const completed = completedTopics[uid]?.size || 0;
    const bonus = completed >= 3 ? 50 : 0;
    const points = correct * 10 + bonus;
    return { user_id: uid, points, correct, completed, bonus_applied: bonus > 0 };
  });

  // Include users who completed topics but had 0 correct answers (edge case)
  for (const uid of Object.keys(completedTopics)) {
    if (!entries.find((e) => e.user_id === uid)) {
      const completed = completedTopics[uid].size;
      const bonus = completed >= 3 ? 50 : 0;
      entries.push({ user_id: uid, points: bonus, correct: 0, completed, bonus_applied: bonus > 0 });
    }
  }

  entries.sort((a, b) => b.points - a.points);
  const top = entries.slice(0, limit).map((e, i) => ({ rank: i + 1, ...e }));

  // Fetch display names for top users from profiles (public readable)
  const ids = top.map(t => t.user_id);
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids);
    for (const p of (profs || []) as Array<{ id: string; display_name: string | null }>) {
      const id = p.id;
      const dn = p.display_name;
      if (id && dn) names[id] = dn;
    }
  }
  const withNames = top.map(r => ({ ...r, name: names[r.user_id] || null }));
  return NextResponse.json({ date, results: withNames });
}
