import { NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { getClerkUserId } from '@/lib/authBridge';
import { currentUser } from '@clerk/nextjs/server';
import { getAdminClient } from '@/lib/supabaseAdmin';

export async function GET() {
  const userId = await getClerkUserId();
  const db: SupabaseClient = getAdminClient() as unknown as SupabaseClient;
  if (!userId) return NextResponse.json({ profile: null });
  const [{ data: points, error: pointsErr }, { data: prof, error: profErr }] = await Promise.all([
    db.from('user_points').select('streak, last_active_date, total_points').eq('clerk_user_id', userId).maybeSingle(),
    db.from('profiles').select('display_name, prefs').eq('id', userId).maybeSingle(),
  ]);
  const error = pointsErr || profErr;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const streak = points?.streak ?? 0;
  const last_active_date = points?.last_active_date ?? null;
  const total_points = points?.total_points ?? 0;
  const display_name = prof?.display_name ?? null;
  const prefs = prof?.prefs ?? {};
  let email: string | null = null;
  try {
    const u = await currentUser();
    email = (u?.primaryEmailAddress?.emailAddress || u?.emailAddresses?.[0]?.emailAddress || null);
  } catch { email = null; }
  return NextResponse.json({ profile: { id: userId, display_name, streak_count: streak, last_active_date, total_points, prefs, email } });
}

export async function POST(request: Request) {
  const userId = await getClerkUserId();
  const db: SupabaseClient = getAdminClient() as unknown as SupabaseClient;
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
  const { error } = await db.from('profiles').upsert(upsertPayload);
  if (error) {
    if (error.message.toLowerCase().includes('uq_profiles_display_name_ci') || error.message.toLowerCase().includes('unique')) {
      return NextResponse.json({ error: 'display_name_taken', message: 'That display name is already taken.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
