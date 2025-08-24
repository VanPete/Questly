import { NextResponse } from 'next/server';
import { demoTopics } from '@/lib/demoData';
import { getServerClient } from '@/lib/supabaseServer';

export async function GET() {
  // Prefer DB-driven daily topics; fallback to demo if not configured
  const supabase = await getServerClient();
  const today = new Date().toISOString().slice(0, 10); // UTC date
  const { data: daily } = await supabase
    .from('daily_topics')
    .select('beginner_id, intermediate_id, advanced_id, premium_extra_ids')
    .eq('date', today)
    .maybeSingle();

  // Check subscription (premium)
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  let isPremium = false;
  if (userId) {
    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle();
    isPremium = sub?.plan === 'premium';
  }

  if (daily) {
    const ids = [daily.beginner_id, daily.intermediate_id, daily.advanced_id];
    const extra: string[] = Array.isArray(daily.premium_extra_ids) ? daily.premium_extra_ids as unknown as string[] : [];
    const wanted = isPremium ? [...ids, ...extra] : ids;
    const tiles = wanted
      .map(id => demoTopics.find(t => t.id === id))
      .filter(Boolean);
    return NextResponse.json({ tiles });
  }

  // Fallback: 1 Beginner, 1 Intermediate, 1 Advanced
  const pick = (difficulty: string) => demoTopics.filter(t => t.difficulty === difficulty)[0];
  const tiles = [pick('Beginner'), pick('Intermediate'), pick('Advanced')].filter(Boolean);
  return NextResponse.json({ tiles });
}
