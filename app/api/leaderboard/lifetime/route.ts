import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';

export async function GET(request: Request) {
  const supabase = getAdminClient();
  const uid = await getSupabaseUserIdFromClerk();
  if (!uid) return NextResponse.json({ error: 'auth required' }, { status: 401 });
  const { data: isPremium } = await supabase.rpc('is_premium', { p_user_id: uid });
  if (!isPremium) return NextResponse.json({ error: 'premium_required' }, { status: 403 });

  const limit = Math.max(1, Math.min(100, Number(new URL(request.url).searchParams.get('limit') || 50)));
  const { data, error } = await supabase
    .from('user_points')
    .select('clerk_user_id, total_points')
    .order('total_points', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  type Row = { clerk_user_id: string; total_points: number };
  const rows = (data || []) as Row[];
  const ids = rows.map(r => r.clerk_user_id);
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
  const results = rows.map((r: Row, i: number) => ({ rank: i + 1, user_id: r.clerk_user_id, name: names[r.clerk_user_id] || null, points: r.total_points }));
  return NextResponse.json({ results });
}
