import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

// GET /api/quiz?topic_id=...
// Returns the latest attempt and answers for the signed-in user (if any)
export async function GET(request: Request) {
  const supabase = await getServerClient();
  const url = new URL(request.url);
  const topic_id = url.searchParams.get('topic_id');
  if (!topic_id) return NextResponse.json({ error: 'missing topic_id' }, { status: 400 });
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;
  if (!userId) return NextResponse.json({ attempt: null });
  const { data: attempt } = await supabase
    .from('quiz_attempts')
    .select('id, total, score')
    .eq('user_id', userId)
    .eq('topic_id', topic_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!attempt) return NextResponse.json({ attempt: null });
  const { data: answers } = await supabase
    .from('quiz_answers')
    .select('question, options, correct_index, chosen_index, is_correct')
    .eq('attempt_id', attempt.id);
  return NextResponse.json({ attempt: { attempt_id: attempt.id, score: attempt.score, total: attempt.total, answers } });
}

// POST /api/quiz  { topic_id, questions: [{ q, options, correct_index, chosen_index }] }
export async function POST(request: Request) {
  const supabase = await getServerClient();
  const body = await request.json();
  const { topic_id, questions } = body as { topic_id?: string; questions?: Array<{ q: string; options: string[]; correct_index: number; chosen_index: number }>; };
  if (!topic_id || !Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }
  if (questions.some(q => !q || typeof q.q !== 'string' || !Array.isArray(q.options) || q.options.length !== 4)) {
    return NextResponse.json({ error: 'invalid questions' }, { status: 400 });
  }
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;

  // If user is signed in, enforce single attempt per topic
  if (userId) {
    const { data: existing } = await supabase
      .from('quiz_attempts')
      .select('id, total, score')
      .eq('user_id', userId)
      .eq('topic_id', topic_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { data: answers } = await supabase
        .from('quiz_answers')
        .select('question, options, correct_index, chosen_index, is_correct')
        .eq('attempt_id', existing.id);
      return NextResponse.json({ attempt_id: existing.id, score: existing.score, total: existing.total, answers, alreadyAttempted: true });
    }
  }
  const total = questions.length;
  const score = questions.filter(x => x.chosen_index === x.correct_index).length;
  const { data: attempt, error: aerr } = await supabase
    .from('quiz_attempts')
    .insert({ user_id: userId, topic_id, total, score })
    .select('id')
    .single();
  if (aerr) return NextResponse.json({ error: aerr.message }, { status: 500 });
  const rows = questions.map(q => ({
    attempt_id: attempt.id,
    question: q.q,
    options: q.options,
    correct_index: q.correct_index,
    chosen_index: q.chosen_index,
    is_correct: q.chosen_index === q.correct_index,
  }));
  const { error: qerr } = await supabase.from('quiz_answers').insert(rows);
  if (qerr) return NextResponse.json({ error: qerr.message }, { status: 500 });
  // Return full answers payload to allow anonymous users to review immediately without SELECT access
  return NextResponse.json({ attempt_id: attempt.id, score, total, answers: rows });
}
