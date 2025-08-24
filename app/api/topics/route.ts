import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? '12');
  const domain = searchParams.get('domain');
  const difficulty = searchParams.get('difficulty');

  let query = supabase
    .from('topics')
    .select('id,title,blurb,difficulty,domain')
    .limit(200);

  if (domain) query = query.eq('domain', domain);
  if (difficulty) query = query.eq('difficulty', difficulty);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shuffled = [...(data ?? [])].sort(() => Math.random() - 0.5).slice(0, limit);
  const topics = shuffled.map(t => ({
    id: t.id,
    title: t.title,
    blurb: t.blurb,
    difficulty: t.difficulty,
    domain: (t as any).domain ?? 'Topic',
  }));

  return NextResponse.json({ topics });
}
