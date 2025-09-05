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
  const d = date ?? new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const { data, error } = await supabase
    .from('daily_topics')
    .select('free_beginner_id,free_intermediate_id,free_advanced_id,premium_beginner_id,premium_intermediate_id,premium_advanced_id')
    .eq('date', d)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Return an ordered list of Topic objects for the given date.
export async function fetchDailyTopics(date?: string): Promise<Topic[] | null> {
  const d = date ?? new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const daily = await fetchDailyTopicsForDate(d).catch(() => null);
  if (!daily) return null;

  const freeIds = [daily.free_beginner_id, daily.free_intermediate_id, daily.free_advanced_id].filter(Boolean) as string[];
  const premiumIds = [daily.premium_beginner_id, daily.premium_intermediate_id, daily.premium_advanced_id].filter(Boolean) as string[];
  const wanted = [...freeIds, ...premiumIds].filter(Boolean) as string[];
  if (wanted.length === 0) return null;

  const rows = await fetchTopicsByIds(wanted);
  const map = new Map((rows ?? []).map((r: unknown) => {
    const obj = r as Record<string, unknown>;
    return [String(obj.id), obj] as const;
  }));

  // Map primary trio in order, then append extras (deduped)
  const primary = freeIds
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

  const premiumUnique = premiumIds.filter(e => !freeIds.includes(e));
  const extras = premiumUnique
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