import { createClient } from '@supabase/supabase-js';
import type { Topic } from './types';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function fetchTopicsByIds(ids: string[]) {
  if (!ids || ids.length === 0) return [];
  const { data, error } = await supabase
    .from('topics')
    .select('id,title,blurb,difficulty,domain,angles,seed_context,tags,created_at')
    .in('id', ids)
    .limit(200);
  if (error) throw error;
  return data;
}

export async function fetchDailyTopicsForDate(date?: string) {
  const d = date ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('daily_topics')
    .select('beginner_id,intermediate_id,advanced_id,premium_extra_ids')
    .eq('date', d)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Return an ordered list of Topic objects for the given date.
export async function fetchDailyTopics(date?: string): Promise<Topic[] | null> {
  const d = date ?? new Date().toISOString().slice(0, 10);
  const daily = await fetchDailyTopicsForDate(d).catch(() => null);
  if (!daily) return null;

  const ids = [daily.beginner_id, daily.intermediate_id, daily.advanced_id].filter(Boolean) as string[];
  const extra: string[] = Array.isArray(daily.premium_extra_ids) ? (daily.premium_extra_ids as string[]) : [];
  const wanted = [...ids, ...extra].filter(Boolean) as string[];
  if (wanted.length === 0) return null;

  const rows = await fetchTopicsByIds(wanted);
  const map = new Map((rows ?? []).map((r: unknown) => {
    const obj = r as Record<string, unknown>;
    return [String(obj.id), obj] as const;
  }));

  // Map primary trio in order, then append extras (deduped)
  const primary = ids
    .map(id => {
      const r = map.get(id);
      if (!r) return null;
      return {
        id: String(r.id),
        title: String(r.title ?? ''),
        blurb: String(r.blurb ?? ''),
        difficulty: String(r.difficulty ?? 'Beginner') as Topic['difficulty'],
        domain: String(r.domain ?? 'Topic') as Topic['domain'],
        angles: Array.isArray(r.angles) ? (r.angles as unknown[]).map(a => String(a)) : [],
        seedContext: r.seed_context ?? null,
        tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(t => String(t)) : [],
        created_at: r.created_at ?? null,
      } as Topic;
    })
    .filter(Boolean) as Topic[];

  const extraIds = extra.filter(e => !ids.includes(e));
  const extras = extraIds
    .map(id => {
      const r = map.get(id);
      if (!r) return null;
      return {
        id: String(r.id),
        title: String(r.title ?? ''),
        blurb: String(r.blurb ?? ''),
        difficulty: String(r.difficulty ?? 'Beginner') as Topic['difficulty'],
        domain: String(r.domain ?? 'Topic') as Topic['domain'],
        angles: Array.isArray(r.angles) ? (r.angles as unknown[]).map(a => String(a)) : [],
        seedContext: r.seed_context ?? null,
        tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(t => String(t)) : [],
        created_at: r.created_at ?? null,
      } as Topic;
    })
    .filter(Boolean) as Topic[];

  return [...primary, ...extras];
}