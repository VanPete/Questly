import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const admin = getAdminClient();
  const userId = await getSupabaseUserIdFromClerk();
  if (!userId) return NextResponse.json({ error: 'no-user' }, { status: 400 });

  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();
  const { data: points } = await admin.from('user_points').select('*').eq('clerk_user_id', userId).maybeSingle();
  const { data: subscription } = await admin.from('user_subscriptions').select('*').eq('clerk_user_id', userId).maybeSingle();
  const { data: isPremium } = await admin.rpc('is_premium', { p_user_id: userId });

  return NextResponse.json({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_URL: process.env.SUPABASE_URL,
      // Do not return secrets; just flag presence
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    userId,
    profile,
    points,
    subscription,
    isPremium,
  });
}
