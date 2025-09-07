import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';
import { businessDate } from '@/lib/date';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') || businessDate();
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 50)));

  const supabase = await getServerClient();
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

  const entries = Object.entries(totals)
    .map(([user_id, points]) => ({ user_id, points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);

  const ids = entries.map(e => e.user_id);
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
  const results = entries.map((e, i) => ({ rank: i + 1, user_id: e.user_id, points: e.points, name: names[e.user_id] || null }));
  return NextResponse.json({ date, results });
}
