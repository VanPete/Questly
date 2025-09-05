import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const supa = getAdminClient();
  const userId = await getSupabaseUserIdFromClerk();
  let premium: boolean | null = null;
  if (userId) {
    const { data } = await supa.rpc('is_premium', { p_user_id: userId });
    premium = !!data;
  }
  return NextResponse.json({
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    userId,
    premium,
    now: new Date().toISOString(),
  });
}