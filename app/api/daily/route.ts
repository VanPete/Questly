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
    const ids = [daily.beginner_id, daily.intermediate_id, daily.advanced_id].filter(Boolean) as string[];
    let extra: string[] = Array.isArray(daily.premium_extra_ids) ? (daily.premium_extra_ids as unknown as string[]) : [];

    // If premium extras are not present for today, synthesize them from active topics
    if (isPremium && extra.length < 3) {
      const { data: all } = await supabase
        .from('topics')
        .select('id,difficulty')
        .eq('is_active', true)
        .limit(3000);
      if (all && all.length > 0) {
        const byDiff: Record<string, string[]> = { Beginner: [], Intermediate: [], Advanced: [] };
        for (const t of all as Array<{ id: string; difficulty: string }>) {
          if (ids.includes(t.id)) continue;
          if (t.difficulty === 'Beginner') byDiff.Beginner.push(t.id);
          if (t.difficulty === 'Intermediate') byDiff.Intermediate.push(t.id);
          if (t.difficulty === 'Advanced') byDiff.Advanced.push(t.id);
        }
        const pickOne = (arr: string[]) => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined);
        const chosen = [pickOne(byDiff.Beginner), pickOne(byDiff.Intermediate), pickOne(byDiff.Advanced)].filter(Boolean) as string[];
        // Ensure uniqueness and avoid duplicates with existing extra
        const set = new Set([...extra, ...chosen]);
        extra = Array.from(set).slice(0, 3);
      }
    }

    const wanted = isPremium ? [...ids, ...extra] : ids;
    // Prefer canonical topics from DB
    const { data: topicsRows } = await supabase
      .from('topics')
      .select('id,title,blurb,difficulty,domain,angles,seed_context')
      .in('id', wanted)
      .limit(500);
    let tiles = (topicsRows || []).map(r => ({ id: r.id as string, title: r.title as string, blurb: r.blurb as string, difficulty: r.difficulty as string }));
    if (tiles.length === 0) {
      // Fallback to demo mapping if DB empty
      tiles = wanted.map(id => demoTopics.find(t => t.id === id)).filter(Boolean) as typeof tiles;
    }
    return NextResponse.json({ tiles });
  }

  // Fallback: 1 Beginner, 1 Intermediate, 1 Advanced
  const pick = (difficulty: string) => demoTopics.filter(t => t.difficulty === difficulty)[0];
  const tiles = [pick('Beginner'), pick('Intermediate'), pick('Advanced')].filter(Boolean);
  return NextResponse.json({ tiles });
}
