import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { type SupabaseClient } from '@supabase/supabase-js';
import { getClerkUserId } from '@/lib/authBridge';
import { businessDate } from '@/lib/date';

// POST /api/progress { date, topic_id, quick_correct, quiz_score, quiz_total, completed }
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  // NOTE: Using the regular server (anon) client here fails RLS because we do NOT have a Supabase auth JWT
  // (we use Clerk IDs directly). Policies rely on current_clerk_id() which reads request.jwt.claims -> sub.
  // Until we mint Supabase JWTs for Clerk users, use the admin client for this controlled server-side endpoint.
  const supabase: SupabaseClient = getAdminClient() as unknown as SupabaseClient;
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
  // If a Supabase user JWT were provided we could downgrade to anon client + RLS, but not needed now.
  }
  const body = await request.json();
  const { topic_id, quick_correct, quiz_score, quiz_total, completed } = body as {
    date?: string; topic_id?: string; quick_correct?: boolean; quiz_score?: number; quiz_total?: number; completed?: boolean;
  };
  if (!topic_id) return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  if (quiz_score != null && quiz_total != null && (quiz_score < 0 || quiz_total <= 0 || quiz_score > quiz_total)) {
    return NextResponse.json({ error: 'invalid score' }, { status: 400 });
  }

  // Auth user
  const userId = token ? (await supabase.auth.getUser(token)).data?.user?.id : await getClerkUserId();
  if (!userId) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  // Use unified business date (ET) so streaks + daily points + leaderboard align
  const effectiveDate = businessDate();
  // Atomic apply via Postgres function (handles points, streak, cap, idempotency)
  const { data, error: ferr } = await supabase.rpc('apply_quiz_progress', {
    p_user_id: userId,
    p_date: effectiveDate,
    p_topic_id: topic_id,
    p_quick_correct: !!quick_correct,
    p_quiz_score: quiz_score ?? null,
    p_quiz_total: quiz_total ?? null,
    p_completed: !!completed,
  });
  if (ferr) return NextResponse.json({ error: ferr.message }, { status: 500 });
  return NextResponse.json(data || {});
}
