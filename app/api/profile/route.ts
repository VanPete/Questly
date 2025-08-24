import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

export async function GET() {
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return NextResponse.json({ profile: null });
  const { data, error } = await supabase
    .from('user_points')
    .select('streak, last_active_date, total_points')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const streak = data?.streak ?? 0;
  const last_active_date = data?.last_active_date ?? null;
  const total_points = data?.total_points ?? 0;
  return NextResponse.json({ profile: { id: userId, streak_count: streak, last_active_date, total_points } });
}
