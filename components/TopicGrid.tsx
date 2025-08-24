'use client';
import useSWR from 'swr';
import TopicCard from './TopicCard';
import { useSearchParams } from 'next/navigation';
import type { Topic } from '@/lib/types';
import SkeletonCard from './SkeletonCard';

const fetcher = <T,>(url: string): Promise<T> => fetch(url).then((r) => r.json());

export default function TopicGrid() {
  const sp = useSearchParams();
  const qs = sp.toString();
  const url = '/api/topics' + (qs ? `?${qs}&limit=12` : '?limit=12');

  const { data, isLoading, error, mutate } = useSWR<{ topics: Topic[] }>(url, fetcher);
  if (error) {
    return (
      <div className="text-center py-10">
        <div className="mb-2">⚠️ Couldn’t load topics.</div>
        <button className="border rounded-xl px-3 py-2" onClick={()=>mutate()}>
          Retry
        </button>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {data?.topics?.map((t) => <TopicCard key={t.id} {...t} />)}
    </div>
  );
}
