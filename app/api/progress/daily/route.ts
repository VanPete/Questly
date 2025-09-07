import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getClerkUserId } from '@/lib/authBridge';
import { businessDate } from '@/lib/date';

// GET /api/progress/daily?date=YYYY-MM-DD (defaults to today UTC date slice)
export async function GET(req: Request) {
  const supabase = getAdminClient();
  const userId = await getClerkUserId();
  if (!userId) return NextResponse.json({ error: 'auth required' }, { status: 401 });
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || businessDate();
  try {
    const { data: rows, error: rerr } = await supabase
      .from('user_progress')
      .select('topic_id, points_awarded, created_at')
      .eq('clerk_user_id', userId)
      .eq('date', date)
      .order('created_at', { ascending: true });
    if (rerr) throw rerr;
    const topicIds = Array.from(new Set((rows || []).map(r => r.topic_id)));
  const titles: Record<string,string> = {};
    if (topicIds.length) {
      const { data: topics, error: terr } = await supabase
        .from('topics')
        .select('id,title')
        .in('id', topicIds);
      if (!terr && topics) {
        for (const t of topics) titles[t.id] = t.title as string;
      }
    }
    const quests = (rows || []).map((r, idx) => ({
      topic_id: r.topic_id,
      title: titles[r.topic_id] || r.topic_id,
      points: r.points_awarded || 0,
      questNumber: idx + 1,
    }));
    const total_points = quests.reduce((a,b)=>a + b.points,0);
    const { data: up } = await supabase.from('user_points').select('streak').eq('clerk_user_id', userId).maybeSingle();
    const { data: sub } = await supabase.from('user_subscriptions').select('plan,status').eq('clerk_user_id', userId).maybeSingle();
    const isPremium = !!(sub && sub.plan === 'premium' && ['active','trialing','past_due'].includes(sub.status || 'active'));
    return NextResponse.json({ date, total_points, quests, streak: up?.streak || 0, isPremium });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
