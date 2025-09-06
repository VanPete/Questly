import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { clerkClient } from '@clerk/nextjs/server';

// Utility: today in America/New_York (same logic used elsewhere for daily topics)
function todayET(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(now); // YYYY-MM-DD
}

/**
 * Admin testing helper to reset a user's state (attempts, progress, points, streak, chat usage, leaderboard rows).
 * SECURITY: Follows same production gating as other admin routes (cron header or shared secret) to avoid abuse.
 * Local dev (non-production) is always allowed.
 *
 * POST body JSON:
 *   email: string (required)
 *   date?: string (YYYY-MM-DD)   // If provided and all != true, will scope deletions to this date. Defaults to today ET.
 *   all?: boolean                 // If true, ignore date filter and wipe all historical rows for selected tables.
 *   resetPoints?: boolean         // Reset total_points to 0 (does not touch streak unless resetStreak true)
 *   resetStreak?: boolean         // Reset streak + longest_streak + last_active_date
 *   resetChat?: boolean           // Clear user_chat_usage rows (date scoped unless all)
 *   resetLeaderboard?: boolean    // Clear leaderboard_daily rows (date scoped unless all)
 *
 * Always removes quiz_attempts (cascade quiz_answers) and user_progress for scope to allow fresh completions.
 */
export async function POST(request: Request) {
  const headers = request.headers;
  const cronHeader = headers.get('x-vercel-cron');
  const secretHeader = headers.get('x-cron-secret');
  if (!(cronHeader || (process.env.CRON_SECRET && secretHeader === process.env.CRON_SECRET))) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const emailRaw = body.email as string | undefined;
  if (!emailRaw) return NextResponse.json({ error: 'email required' }, { status: 400 });
  const email = emailRaw.toLowerCase();
  const all = !!body.all;
  const resetPoints = !!body.resetPoints;
  const resetStreak = !!body.resetStreak;
  const resetChat = !!body.resetChat;
  const resetLeaderboard = !!body.resetLeaderboard;
  const date = (body.date as string | undefined) || todayET();

  // Resolve Clerk user by email
  const c = await clerkClient();
  const list = await c.users.getUserList({ emailAddress: [email], limit: 1 });
  const user = list?.data?.[0];
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  const uid = user.id;

  const admin = getAdminClient();

  // Fetch existing points snapshot
  const { data: existingPoints } = await admin.from('user_points').select('*').eq('clerk_user_id', uid).maybeSingle();

  const summary: Record<string, unknown> = { user_id: uid, email, scope: all ? 'all' : date };

  // Delete quiz_attempts (cascade quiz_answers)
  let qaDel = admin.from('quiz_attempts').delete().eq('clerk_user_id', uid);
  if (!all) qaDel = qaDel.gte('created_at', date + 'T00:00:00Z').lt('created_at', date + 'T23:59:59.999Z');
  const { data: qaDeleted, error: qaErr } = await qaDel.select('id');
  if (qaErr) return NextResponse.json({ error: qaErr.message, step: 'delete_quiz_attempts' }, { status: 500 });
  summary.deleted_quiz_attempts = qaDeleted?.length || 0;

  // Delete user_progress
  let upDel = admin.from('user_progress').delete().eq('clerk_user_id', uid);
  if (!all) upDel = upDel.eq('date', date);
  const { data: upDeleted, error: upErr } = await upDel.select('id');
  if (upErr) return NextResponse.json({ error: upErr.message, step: 'delete_user_progress' }, { status: 500 });
  summary.deleted_user_progress = upDeleted?.length || 0;

  // Chat usage
  if (resetChat) {
    let cuDel = admin.from('user_chat_usage').delete().eq('clerk_user_id', uid);
    if (!all) cuDel = cuDel.eq('date', date);
    const { data: cuDeleted, error: cuErr } = await cuDel.select('date');
    if (cuErr) return NextResponse.json({ error: cuErr.message, step: 'delete_chat_usage' }, { status: 500 });
    summary.deleted_chat_usage_rows = cuDeleted?.length || 0;
  }

  // Leaderboard daily rows
  if (resetLeaderboard) {
    let lbDel = admin.from('leaderboard_daily').delete().eq('clerk_user_id', uid);
    if (!all) lbDel = lbDel.eq('date', date);
    const { data: lbDeleted, error: lbErr } = await lbDel.select('date');
    if (lbErr) return NextResponse.json({ error: lbErr.message, step: 'delete_leaderboard_daily' }, { status: 500 });
    summary.deleted_leaderboard_rows = lbDeleted?.length || 0;
  }

  // Points / streak reset
  if (resetPoints || resetStreak) {
    // Ensure row exists first
    if (!existingPoints) {
      await admin.from('user_points').insert({ clerk_user_id: uid, total_points: 0, streak: 0, longest_streak: 0 });
    }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (resetPoints) updates.total_points = 0;
    if (resetStreak) { updates.streak = 0; updates.longest_streak = 0; updates.last_active_date = null; }
    const { error: upPtsErr } = await admin.from('user_points').update(updates).eq('clerk_user_id', uid);
    if (upPtsErr) return NextResponse.json({ error: upPtsErr.message, step: 'update_user_points' }, { status: 500 });
    summary.points_reset = resetPoints;
    summary.streak_reset = resetStreak;
    summary.previous_points_snapshot = existingPoints || null;
  }

  return NextResponse.json({ ok: true, ...summary });
}

export async function GET() {
  // Provide a lightweight status / usage description (does not perform mutation)
  return NextResponse.json({
    ok: true,
    usage: 'POST email (required), optional: date (YYYY-MM-DD), all, resetPoints, resetStreak, resetChat, resetLeaderboard',
    example: { email: 'user@example.com', resetPoints: true, resetStreak: true },
  });
}
