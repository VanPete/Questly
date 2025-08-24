import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

export async function GET() {
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return NextResponse.json({ profile: null });
  const [{ data: points, error: pointsErr }, { data: prof, error: profErr }] = await Promise.all([
    supabase.from('user_points').select('streak, last_active_date, total_points').eq('user_id', userId).maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
  ]);
  const error = pointsErr || profErr;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const streak = points?.streak ?? 0;
  const last_active_date = points?.last_active_date ?? null;
  const total_points = points?.total_points ?? 0;
  const display_name = prof?.display_name ?? null;
  return NextResponse.json({ profile: { id: userId, display_name, streak_count: streak, last_active_date, total_points } });
}

export async function POST(request: Request) {
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return NextResponse.json({ error: 'auth required' }, { status: 401 });
  const body = await request.json().catch(() => ({} as { display_name?: string }));
  const name = (body.display_name ?? '').toString().trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  const { error } = await supabase.from('profiles').upsert({ id: userId, display_name: name });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
