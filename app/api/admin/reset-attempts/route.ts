import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';

export async function POST(request: Request) {
  const headers = request.headers;
  const cronHeader = headers.get('x-vercel-cron');
  const secretHeader = headers.get('x-cron-secret');
  if (!(cronHeader || (process.env.CRON_SECRET && secretHeader === process.env.CRON_SECRET))) {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const email = (body.email as string | undefined)?.toLowerCase();
  const topicId = body.topicId as string | undefined;
  const date = body.date as string | undefined;
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const admin = getAdminClient();
  // Look up user by email
  const { data: users, error: uerr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });
  const user = (users?.users || []).find(u => u.email?.toLowerCase() === email);
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  const user_id = user.id;
  // Delete quiz_attempts (+ cascade quiz_answers) optionally filtered by topic
  let q = admin.from('quiz_attempts').delete().eq('user_id', user_id);
  if (topicId) q = q.eq('topic_id', topicId);
  const { error: delErr, data: deleted } = await q.select('id');
  const count = Array.isArray(deleted) ? deleted.length : 0;
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Optionally clear user_progress for that date/topic to allow re-completion
  if (date) {
    let qp = admin.from('user_progress').delete().eq('user_id', user_id).eq('date', date);
    if (topicId) qp = qp.eq('topic_id', topicId);
    await qp;
  }

  return NextResponse.json({ ok: true, deleted_attempts: count || 0 });
}
