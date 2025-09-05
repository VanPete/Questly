import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';
import { bootstrapCurrentUser } from '@/lib/bootstrapUser';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const admin = getAdminClient();
  const userId = await getSupabaseUserIdFromClerk();
  if (!userId) return NextResponse.json({ error: 'no-user' }, { status: 400 });
  const out: Record<string, unknown> = { userId };
  try {
    await bootstrapCurrentUser();
    out.bootstrap = 'ok';
  } catch (e: unknown) {
    out.bootstrap = 'failed';
    out.bootstrapError = e instanceof Error ? e.message : 'unknown-error';
  }
  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();
  const { data: points } = await admin.from('user_points').select('*').eq('clerk_user_id', userId).maybeSingle();
  out.profile = profile || null;
  out.user_points = points || null;
  return NextResponse.json(out);
}