import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';

export async function GET() {
  const supabase = getAdminClient();
  const uid = await getSupabaseUserIdFromClerk();
  if (!uid) return NextResponse.json({ error: 'auth required' }, { status: 401 });
  const { data: isPremium } = await supabase.rpc('is_premium', { p_user_id: uid });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });
  const limit = 10; // fixed Top 10
  const { data, error } = await supabase
    .from('user_points')
    .select('clerk_user_id, total_points')
    .order('total_points', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  type Row = { clerk_user_id: string; total_points: number };
  const full = (data || []) as Row[];
  const top10 = full.slice(0, limit);
  // Find my rank
  let me: { clerk_user_id: string; total_points: number; rank: number } | null = null;
  const myRow = full.find(r => r.clerk_user_id === uid);
  if (myRow) {
    const myPoints = myRow.total_points;
    let rank = 1;
    for (const r of full) {
      if (r.total_points > myPoints) rank++; else break;
    }
    me = { clerk_user_id: uid, total_points: myPoints, rank };
  }
  const ids = [
    ...top10.map(r => r.clerk_user_id),
    ...(me && me.rank > 10 ? [me.clerk_user_id] : []),
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
  const results = top10.map((r: Row, i: number) => ({ rank: i + 1, user_id: r.clerk_user_id, name: names[r.clerk_user_id] || null, points: r.total_points, is_me: r.clerk_user_id === uid }));
  const meRow = me && me.rank > 10 ? { rank: me.rank, user_id: me.clerk_user_id, name: names[me.clerk_user_id] || null, points: me.total_points, is_me: true } : null;
  return NextResponse.json({ results, me: meRow });
}
