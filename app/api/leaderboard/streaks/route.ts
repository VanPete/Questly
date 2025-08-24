import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

export async function GET() {
  const supabase = await getServerClient();
  // Top current streaks
  const { data: current, error: currErr } = await supabase
    .from('user_points')
    .select('user_id, streak')
    .order('streak', { ascending: false })
    .limit(10);
  // Top all-time streaks
  const { data: alltime, error: allErr } = await supabase
    .from('user_points')
    .select('user_id, longest_streak')
    .order('longest_streak', { ascending: false })
    .limit(10);
  if (currErr || allErr) return NextResponse.json({ error: currErr?.message || allErr?.message }, { status: 500 });
  // Fetch display names
  const ids = [
    ...(current?.map(r => r.user_id) || []),
    ...(alltime?.map(r => r.user_id) || [])
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
  return NextResponse.json({
    current: (current || []).map((r, i) => ({ rank: i + 1, user_id: r.user_id, name: names[r.user_id] || null, streak: r.streak })),
    alltime: (alltime || []).map((r, i) => ({ rank: i + 1, user_id: r.user_id, name: names[r.user_id] || null, longest_streak: r.longest_streak })),
  });
}