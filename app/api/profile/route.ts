import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  let supabase: SupabaseClient = await getServerClient() as unknown as SupabaseClient;
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    }
  }
  const { data: userData } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return NextResponse.json({ profile: null });
  const [{ data: points, error: pointsErr }, { data: prof, error: profErr }] = await Promise.all([
    supabase.from('user_points').select('streak, last_active_date, total_points').eq('user_id', userId).maybeSingle(),
    supabase.from('profiles').select('display_name, prefs').eq('id', userId).maybeSingle(),
  ]);
  const error = pointsErr || profErr;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const streak = points?.streak ?? 0;
  const last_active_date = points?.last_active_date ?? null;
  const total_points = points?.total_points ?? 0;
  const display_name = prof?.display_name ?? null;
  const prefs = prof?.prefs ?? {};
  const email = userData?.user?.email ?? null;
  return NextResponse.json({ profile: { id: userId, display_name, streak_count: streak, last_active_date, total_points, prefs, email } });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  let supabase: SupabaseClient = await getServerClient() as unknown as SupabaseClient;
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    }
  }
  const { data: userData } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return NextResponse.json({ error: 'auth required' }, { status: 401 });
  type ProfilePayload = { display_name?: string; prefs?: Record<string, unknown> };
  const body = await request.json().catch(() => ({} as ProfilePayload)) as ProfilePayload;
  const rawName = (body.display_name ?? '').toString().trim();
  const name = rawName ? rawName.slice(0, 40) : '';
  const prefs = body.prefs ?? undefined;
  if (!name && prefs === undefined) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  if (name && (name.length < 3 || name.length > 40)) {
    return NextResponse.json({ error: 'display_name_length', message: 'Display name must be 3–40 characters.' }, { status: 400 });
  }
  const upsertPayload: Record<string, unknown> = { id: userId };
  if (name) upsertPayload.display_name = name;
  if (prefs !== undefined) upsertPayload.prefs = prefs;
  const { error } = await supabase.from('profiles').upsert(upsertPayload);
  if (error) {
    if (error.message.toLowerCase().includes('uq_profiles_display_name_ci') || error.message.toLowerCase().includes('unique')) {
      return NextResponse.json({ error: 'display_name_taken', message: 'That display name is already taken.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
