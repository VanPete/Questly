import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

export async function GET() {
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return NextResponse.json({ plan: 'free' });
  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('plan')
    .eq('user_id', uid)
    .maybeSingle();
  return NextResponse.json({ plan: sub?.plan || 'free' });
}
