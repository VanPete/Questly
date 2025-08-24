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
  const results = (data || []).map((r, i) => ({ rank: i + 1, user_id: r.user_id, points: r.total_points }));
  return NextResponse.json({ results });
}
