import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { businessDate } from '@/lib/date';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || businessDate();
  const limit = 10; // fixed Top 10

  // Use admin client so we can read all users' progress rows (RLS restricts anon to current user only)
  const supabase = getAdminClient();
  const uid = await getSupabaseUserIdFromClerk().catch(() => null);
  // Sum real awarded points (already reflects streak & quest bonuses and caps)
  interface ProgressRow { clerk_user_id: string; points_awarded: number | null }
  const query = supabase
    .from('user_progress')
    .select('clerk_user_id, points_awarded')
    .eq('date', date)
    .not('points_awarded', 'is', null);
  const { data, error } = await query;
  const rows = data as ProgressRow[] | null;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totals: Record<string, number> = {};
  for (const r of rows || []) {
    const uid = r.clerk_user_id;
    const pts = r.points_awarded;
    if (!uid || pts == null) continue;
    totals[uid] = (totals[uid] || 0) + pts;
  }

  const fullSorted = Object.entries(totals)
    .map(([user_id, points]) => ({ user_id, points }))
    .sort((a, b) => b.points - a.points);
  const entries = fullSorted.slice(0, limit);

  // Determine my rank if signed in
  let me: { user_id: string; points: number; rank: number } | null = null;
  if (uid && totals[uid] != null) {
    const myPoints = totals[uid];
    let rank = 1;
    for (const e of fullSorted) {
      if (e.points > myPoints) rank++;
      else break; // fullSorted is desc; first non-greater means we've reached my bucket
    }
    me = { user_id: uid, points: myPoints!, rank };
  }

  const ids = [
    ...entries.map(e => e.user_id),
    ...(me && me.rank > 10 ? [me.user_id] : []),
  ];
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', ids);
    for (const p of (profs || []) as Array<{ id: string; display_name: string | null }>) {
      if (p.display_name) names[p.id] = p.display_name;
    }
  }
  const results = entries.map((e, i) => ({ rank: i + 1, user_id: e.user_id, points: e.points, name: names[e.user_id] || null, is_me: uid ? e.user_id === uid : false }));
  const meRow = me && me.rank > 10 ? { rank: me.rank, user_id: me.user_id, points: me.points, name: names[me.user_id] || null, is_me: true } : null;
  return NextResponse.json({ date, results, me: meRow });
}
