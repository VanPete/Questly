import { NextResponse } from 'next/server';
import { OPENAI_BASE, OPENAI_KEY, OPENAI_MODEL, TEMPS, LIMITS } from '@/lib/openai';
import { demoQuestionBank } from '@/lib/demoQuestions';
import { getServerClient } from '@/lib/supabaseServer';

type Topic = { id: string; title: string; blurb?: string; seedContext?: string | null };
type MCQ = { q: string; options: string[]; correct_index: number };
type GeneratedPack = { quick?: MCQ; quiz?: MCQ[] };

declare global {
  var __QUESTLY_Q_CACHE: Map<string, GeneratedPack> | undefined;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { topic } = body as { topic?: Topic };
  if (!topic || !topic.id || !topic.title) return NextResponse.json({ error: 'invalid payload' }, { status: 400 });

  // simple per-day per-topic in-memory cache to avoid repeated OpenAI calls during runtime
  // Note: resets on cold start. For persistent caching, move to KV/DB.
  const today = new Date().toISOString().slice(0, 10);
  const key = `${today}:${topic.id}`;
  // initialize global cache
  global.__QUESTLY_Q_CACHE = global.__QUESTLY_Q_CACHE || new Map<string, GeneratedPack>();
  const cache = global.__QUESTLY_Q_CACHE;
  if (cache.has(key)) {
    return NextResponse.json(cache.get(key));
  }

  // Persistent cache lookup (Supabase)
  try {
    const supabase = await getServerClient();
    const { data: row } = await supabase
      .from('question_cache')
      .select('payload')
      .eq('date', today)
      .eq('topic_id', topic.id)
      .maybeSingle();
    if (row?.payload) {
      cache.set(key, row.payload as GeneratedPack);
      return NextResponse.json(row.payload);
    }
  } catch {
    // ignore cache read errors
  }

  // Fallback to demo bank if no key
  if (!OPENAI_KEY) {
    const seed = demoQuestionBank[topic.id];
    if (seed) return NextResponse.json(seed);
    return NextResponse.json({ error: 'openai_not_configured' }, { status: 501 });
  }

  const sys = `You generate concise multiple-choice questions (4 options) for a quick warmup and a 5-question mini-quiz.
Output JSON with keys: quick { q, options[4], correct_index }, quiz: [5 of same shape]. Keep accessible language aligned to the topic.
Ensure options length is exactly 4 and correct_index is 0..3.`;
  const userMessage = { role: 'user', content: `Topic: ${topic.title}\nBlurb: ${topic.blurb ?? ''}\nContext: ${topic.seedContext ?? ''}` };

  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: TEMPS.strict,
        max_tokens: LIMITS.maxTokensChat,
        response_format: { type: 'json_object' },
  messages: [ { role: 'system', content: sys }, userMessage ],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text) as { quick?: MCQ; quiz?: MCQ[] };
    // Basic validation
    if (!parsed.quick || !Array.isArray(parsed.quiz) || parsed.quiz.length < 5) throw new Error('bad ai json');
    if (
      !Array.isArray(parsed.quick.options) || parsed.quick.options.length !== 4 ||
      parsed.quiz.some((q) => !Array.isArray(q.options) || q.options.length !== 4)
    ) throw new Error('bad options');
    // Trim to 5
    parsed.quiz = parsed.quiz.slice(0, 5);
  cache.set(key, parsed);
  // write-through persistent cache
  try {
    const supabase = await getServerClient();
    await supabase
      .from('question_cache')
      .upsert({ date: today, topic_id: topic.id, payload: parsed });
  } catch {
    // ignore cache write errors
  }
  return NextResponse.json(parsed);
  } catch {
    const seed = demoQuestionBank[topic.id];
    if (seed) {
      cache.set(key, seed);
      try {
        const supabase = await getServerClient();
        await supabase
          .from('question_cache')
          .upsert({ date: today, topic_id: topic.id, payload: seed });
      } catch {}
      return NextResponse.json(seed);
    }
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 });
  }
}
