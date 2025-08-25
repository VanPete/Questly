import { notFound } from 'next/navigation';
import TopicClient from '@/components/TopicClient';
import { demoTopics } from '@/lib/demoData';
import { getServerClient } from '@/lib/supabaseServer';

export default async function TopicPage({ params }: { params?: Promise<{ id: string }> }) {
  const resolved = params ? await params : undefined;
  const id = resolved?.id;
  if (!id) return notFound();

  const supabase = await getServerClient();
  try {
    const { data, error } = await supabase
      .from('topics')
      .select('id,title,blurb,difficulty,domain,angles,seed_context,tags')
      .eq('id', id)
      .maybeSingle();
    if (!error && data) {
      const topic = {
        id: String(data.id),
        title: String(data.title ?? ''),
        blurb: String(data.blurb ?? ''),
        difficulty: (String(data.difficulty ?? 'Beginner')) as import('@/lib/types').Difficulty,
        domain: (String(data.domain ?? 'Topic')) as import('@/lib/types').Domain,
        // angles are stored as text[] in Postgres and come back as an array
        angles: Array.isArray(data.angles) ? (data.angles as unknown[]).map(a => String(a)) : [],
        seedContext: data.seed_context ?? null,
        tags: Array.isArray(data.tags) ? (data.tags as unknown[]).map(t => String(t)) : [],
      };
      return <TopicClient topic={topic} />;
    }
  } catch {
    // fallthrough to demo fallback
  }

  const topic = demoTopics.find(t => t.id === id);
  if (!topic) return notFound();
  return <TopicClient topic={topic} />;
}
