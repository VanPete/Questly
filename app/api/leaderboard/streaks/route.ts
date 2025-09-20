import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';

export async function GET() {
  const supabase = getAdminClient();
  const uid = await getSupabaseUserIdFromClerk().catch(() => null);

  // Top current streaks
  const { data: current, error: currErr } = await supabase
    .from('user_points')
    .select('clerk_user_id, streak')
    .order('streak', { ascending: false })
    .limit(10);
  // Top all-time streaks
  const { data: alltime, error: allErr } = await supabase
    .from('user_points')
    .select('clerk_user_id, longest_streak')
    .order('longest_streak', { ascending: false })
    .limit(10);
  if (currErr || allErr) return NextResponse.json({ error: currErr?.message || allErr?.message }, { status: 500 });

  // Prepare optional "me" rows
  let me_current: { rank: number; user_id: string; streak: number } | null = null;
  let me_alltime: { rank: number; user_id: string; longest_streak: number } | null = null;
  if (uid) {
    const { data: my } = await supabase
      .from('user_points')
      .select('clerk_user_id, streak, longest_streak')
      .eq('clerk_user_id', uid)
      .maybeSingle();
    if (my) {
      // Compute rank via count of users with strictly greater values
      if (typeof my.streak === 'number') {
        const { count: higherCurr } = await supabase
          .from('user_points')
          .select('clerk_user_id', { count: 'exact', head: true })
          .gt('streak', my.streak as number);
        me_current = { rank: (higherCurr || 0) + 1, user_id: uid, streak: my.streak as number };
      }
      if (typeof my.longest_streak === 'number') {
        const { count: higherAll } = await supabase
          .from('user_points')
          .select('clerk_user_id', { count: 'exact', head: true })
          .gt('longest_streak', my.longest_streak as number);
        me_alltime = { rank: (higherAll || 0) + 1, user_id: uid, longest_streak: my.longest_streak as number };
      }
    }
  }

  // Fetch display names for Top10 plus me rows if outside Top10
  const ids = [
    ...(current?.map(r => r.clerk_user_id) || []),
    ...(alltime?.map(r => r.clerk_user_id) || []),
    ...(me_current && (current || []).every(r => r.clerk_user_id !== me_current!.user_id) ? [me_current.user_id] : []),
    ...(me_alltime && (alltime || []).every(r => r.clerk_user_id !== me_alltime!.user_id) ? [me_alltime.user_id] : []),
  ];
  const uniqueIds = Array.from(new Set(ids));
  const names: Record<string, string> = {};
  if (uniqueIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', uniqueIds);
    for (const p of (profs || []) as Array<{ id: string; display_name: string | null }>) {
      if (p.display_name) names[p.id] = p.display_name;
    }
  }

  const currentOut = (current || []).map((r, i) => ({ rank: i + 1, user_id: r.clerk_user_id, name: names[r.clerk_user_id] || null, streak: r.streak, is_me: uid ? r.clerk_user_id === uid : false }));
  const alltimeOut = (alltime || []).map((r, i) => ({ rank: i + 1, user_id: r.clerk_user_id, name: names[r.clerk_user_id] || null, longest_streak: r.longest_streak, is_me: uid ? r.clerk_user_id === uid : false }));
  const meCurrentOut = me_current && currentOut.every(r => r.user_id !== me_current!.user_id) ? { rank: me_current.rank, user_id: me_current.user_id, name: names[me_current.user_id] || null, streak: me_current.streak, is_me: true } : null;
  const meAlltimeOut = me_alltime && alltimeOut.every(r => r.user_id !== me_alltime!.user_id) ? { rank: me_alltime.rank, user_id: me_alltime.user_id, name: names[me_alltime.user_id] || null, longest_streak: me_alltime.longest_streak, is_me: true } : null;

  return NextResponse.json({
    current: currentOut,
    alltime: alltimeOut,
    me_current: meCurrentOut,
    me_alltime: meAlltimeOut,
  });
}