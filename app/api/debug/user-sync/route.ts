import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getClerkUserId } from '@/lib/authBridge';
import { bootstrapCurrentUser } from '@/lib/bootstrapUser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function forbidden() { return NextResponse.json({ error: 'forbidden' }, { status: 403 }); }

// GET: Inspect current Clerk-linked rows
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== process.env.ADMIN_PAGE_PASSWORD) return forbidden();
  const userId = await getClerkUserId();
  if (!userId) return NextResponse.json({ error: 'no-user' }, { status: 400 });
  const admin = getAdminClient();
  const [profileRes, pointsRes, subRes, progressRes, chatsRes, premiumRes] = await Promise.all([
    admin.from('profiles').select('*').eq('id', userId).maybeSingle(),
    admin.from('user_points').select('*').eq('clerk_user_id', userId).maybeSingle(),
    admin.from('user_subscriptions').select('*').eq('clerk_user_id', userId).maybeSingle(),
    admin.from('user_progress').select('id', { count: 'exact', head: true }).eq('clerk_user_id', userId),
    admin.from('user_chat_usage').select('*').eq('clerk_user_id', userId).order('date', { ascending: false }).limit(7),
    admin.rpc('is_premium', { p_user_id: userId }),
  ]);
  interface CountHead { count?: number }
  const progressCount = (progressRes as CountHead | null)?.count ?? 0;
  interface RpcResult { data?: unknown }
  const premiumVal = (premiumRes as RpcResult | null)?.data;
  return NextResponse.json({
    userId,
    profile: profileRes.data,
    points: pointsRes.data,
    subscription: subRes.data,
    progress_entries: progressCount,
    chat_usage: chatsRes.data,
    is_premium: Array.isArray(premiumVal) ? premiumVal[0] : premiumVal,
  });
}

// POST: Force a re-bootstrap
export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== process.env.ADMIN_PAGE_PASSWORD) return forbidden();
  await bootstrapCurrentUser();
  return NextResponse.json({ ok: true });
}
