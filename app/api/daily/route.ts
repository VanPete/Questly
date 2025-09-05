import { NextResponse } from 'next/server';
import { demoTopics } from '@/lib/demoData';
import { getServerClient } from '@/lib/supabaseServer';

function todayInTimeZoneISODate(tz: string) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // en-CA yields YYYY-MM-DD
}

export async function GET() {
  // Prefer DB-driven daily topics; fallback to demo if not configured
  const supabase = await getServerClient();
  // Use America/New_York to match rotation job and avoid UTC off-by-one
  const today = todayInTimeZoneISODate('America/New_York');
  // We will fetch ordered topic ids via DB helper function

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

  // Use DB helper; if no daily row found it returns empty array
  const { data: idList } = await supabase.rpc('get_daily_topic_ids', { p_date: today, p_is_premium: isPremium });
  const wanted = Array.isArray(idList) ? (idList as string[]) : [];
  if (wanted.length > 0) {
    const { data: topicsRows } = await supabase
      .from('topics')
      .select('id,title,blurb,difficulty,domain,angles,seed_context')
      .in('id', wanted)
      .limit(500);
    const map = new Map((topicsRows || []).map(r => [r.id as string, r] as const));
    // Preserve order from DB function: [B, I, A, extra B, extra I, extra A]
    const tiles = wanted
      .map(id => map.get(id))
      .filter(Boolean)
      .map(r => ({ id: r!.id as string, title: r!.title as string, blurb: r!.blurb as string, difficulty: r!.difficulty as string }));
    if (tiles.length > 0) return NextResponse.json({ tiles });
  }

  // Fallback: 1 Beginner, 1 Intermediate, 1 Advanced
  const pick = (difficulty: string) => demoTopics.filter(t => t.difficulty === difficulty)[0];
  const tiles = [pick('Beginner'), pick('Intermediate'), pick('Advanced')].filter(Boolean);
  return NextResponse.json({ tiles });
}
