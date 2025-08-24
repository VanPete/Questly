import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return NextResponse.json({ error: 'auth required' }, { status: 401 });
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('plan')
    .eq('user_id', uid)
    .maybeSingle();
  if (sub?.plan !== 'premium') return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  const limit = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get('limit') || 50)));
  const { data, error } = await supabase
    .from('user_points')
    .select('user_id, total_points')
    .order('total_points', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data || [];
  const ids = rows.map(r => r.user_id);
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
  const results = rows.map((r, i) => ({ rank: i + 1, user_id: r.user_id, name: names[r.user_id] || null, points: r.total_points }));
  return NextResponse.json({ results });
}
