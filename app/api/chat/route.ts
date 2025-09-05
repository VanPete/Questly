import { NextResponse } from 'next/server';
import { OPENAI_MODEL } from '@/lib/openai';
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
  const { content, mode } = body as { content: string; mode: string };
  if (!content || typeof content !== 'string') return NextResponse.json({ error: 'invalid' }, { status: 400 });

  let plan: 'free' | 'premium' = 'free';
  if (uid) {
    const { data: s } = await supabase.from('user_subscriptions').select('plan').eq('user_id', uid).maybeSingle();
    if (s?.plan === 'premium') plan = 'premium';
  }
  const limit = plan === 'premium' ? 10 : 3;
  if (uid) {
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
  switch (mode) {
    case 'summary':
      reply = 'Here is a brief summary based on our discussion (demo).';
      break;
    case 'plan':
      reply = 'Day 1-7 plan (demo).';
      break;
    case 'quiz':
      reply = '1) Question one... 2) Question two... (demo)';
      break;
    case 'examples':
      reply = 'Example A; Example B; Example C (demo).';
      break;
    default:
      reply = `You said: ${content}. Model: ${OPENAI_MODEL}`;
  }
  // Increment usage after successful reply
  if (uid) {
    const today = todayInET();
    await supabase.rpc('increment_chat_usage', { p_user_id: uid, p_date: today });
  }
  return NextResponse.json({ reply });
}
