import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';

export async function GET() {
  const supabase = getAdminClient();
  const uid = await getSupabaseUserIdFromClerk();
  if (!uid) return NextResponse.json({ plan: 'free' });
  const { data: isPremium } = await supabase.rpc('is_premium', { p_user_id: uid });
  return NextResponse.json({ plan: isPremium ? 'premium' : 'free' });
}
