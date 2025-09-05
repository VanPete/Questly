import { NextResponse } from 'next/server';
import { OPENAI_BASE, OPENAI_KEY, OPENAI_MODEL, TEMPS, LIMITS } from '@/lib/openai';
import { getServerClient } from '@/lib/supabaseServer';

function todayInET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function POST(request: Request) {
  // Enforce per-user daily chat quota: free=3, premium=10
  const supabase = await getServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  const body = await request.json();
  const { content, mode, messages, topic } = body as {
    content?: string;
    mode?: 'explore' | 'summary' | 'plan' | 'quiz' | 'examples';
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    topic?: { id: string; title: string; angles?: string[] };
  };
  // Allow empty content for server-generated modes like 'summary'
  if (mode !== 'summary' && (!content || typeof content !== 'string')) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }

  let plan: 'free' | 'premium' = 'free';
  if (uid) {
    const { data: s } = await supabase.from('user_subscriptions').select('plan').eq('user_id', uid).maybeSingle();
    if (s?.plan === 'premium') plan = 'premium';
  }
  const limit = plan === 'premium' ? 10 : 3;
  if (uid && mode !== 'summary') { // don't count/limit auto summaries against user chat
    const today = todayInET();
    const { data: row, error } = await supabase
      .from('user_chat_usage')
      .upsert({ user_id: uid, date: today, used: 0 }, { onConflict: 'user_id,date' })
      .select('used')
      .single();
    if (!error && row && (row.used as number) >= limit) {
      return NextResponse.json({ error: 'chat_limit' }, { status: 429 });
    }
  }
  let reply = '';

  async function callOpenAI(messagesIn: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) {
    try {
      const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: messagesIn,
          temperature: mode === 'summary' ? TEMPS.strict : TEMPS.explore,
          max_tokens: LIMITS.maxTokensChat,
        }),
      });
      const data = await res.json();
      const text: string | undefined = data?.choices?.[0]?.message?.content;
      return text ?? '';
  } catch {
      return '';
    }
  }

  if (mode === 'summary') {
    const title = topic?.title ?? 'this topic';
    const hints = Array.isArray(topic?.angles) ? topic!.angles!.slice(0, 3).join('; ') : '';
    const system = `You are a concise learning coach. Summarize the topic in 3-4 short sentences, easy to skim. Avoid fluff. If helpful, add 1 quick tip.`;
    const userMsg = `Summarize: ${title}. Hints: ${hints}`;
    reply = await callOpenAI([
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ]);
    if (!reply) reply = 'Here is a brief summary of the key ideas.';
  } else if (mode === 'plan') {
    const system = `You are a learning coach. Create a 7-day plan with brief daily tasks for the topic. Keep items short and actionable.`;
    const userMsg = `Create a 7-day plan for: ${topic?.title ?? ''}. User goal: ${content}`;
    reply = await callOpenAI([
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ]);
    if (!reply) reply = 'Day 1-7 plan coming soon.';
  } else if (mode === 'quiz') {
    const system = `Generate 5 concise multiple-choice questions (A-D) about the topic; do not include answers.`;
    const userMsg = `Topic: ${topic?.title ?? ''}. Focus points: ${(topic?.angles || []).join(', ')}`;
    reply = await callOpenAI([
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ]);
    if (!reply) reply = '1) Question one... 2) Question two...';
  } else if (mode === 'examples') {
    const system = `Provide 3-5 simple, real-world examples for the topic.`;
    const userMsg = `Topic: ${topic?.title ?? ''}`;
    reply = await callOpenAI([
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ]);
    if (!reply) reply = 'Example A; Example B; Example C';
  } else {
    // Regular chat explore mode with short history
    const history = (messages || []).slice(-8); // keep last few for brevity
    const system = `You are a friendly, on-topic tutor. Keep answers focused on the user's question about "${topic?.title ?? 'the topic'}".`;
    const msg = [
      { role: 'system' as const, content: system },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: String(content) },
    ];
    reply = await callOpenAI(msg);
    if (!reply) reply = `I couldn't reach the model. Please try again.`;
  }

  // Increment usage after successful reply (only user-initiated chat)
  if (uid && mode !== 'summary') {
    const today = todayInET();
    await supabase.rpc('increment_chat_usage', { p_user_id: uid, p_date: today });
  }
  return NextResponse.json({ reply });
}
