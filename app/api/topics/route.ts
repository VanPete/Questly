import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { demoTopics } from '@/lib/demoData';
import type { Topic } from '@/lib/types';

type TopicRow = {
  id: string;
  title: string;
  blurb: string;
  difficulty: string;
  domain?: string | null;
};

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
  if (error) {
    // Graceful fallback to demo topics on failure
    let topics: Topic[] = [...demoTopics];
    if (domain) topics = topics.filter(t => t.domain === domain);
    if (difficulty) topics = topics.filter(t => t.difficulty === difficulty);
    const slice = topics.sort(() => Math.random() - 0.5).slice(0, limit);
    return NextResponse.json({ topics: slice });
  }

  const shuffled = [...(data ?? [])].sort(() => Math.random() - 0.5).slice(0, limit);
  const topics = (shuffled as TopicRow[]).map((t) => ({
    id: t.id,
    title: t.title,
    blurb: t.blurb,
    difficulty: t.difficulty,
    domain: t.domain ?? 'Topic',
  }));

  return NextResponse.json({ topics });
}
