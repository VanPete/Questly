'use client';
import useSWR from 'swr';
import TopicCard from './TopicCard';
import { useSearchParams } from 'next/navigation';
import type { Topic } from '@/lib/types';

const fetcher = <T,>(url: string): Promise<T> => fetch(url).then((r) => r.json());

export default function TopicGrid() {
  const sp = useSearchParams();
  const qs = sp.toString();
  const url = '/api/topics' + (qs ? `?${qs}&limit=12` : '?limit=12');

  const { data, isLoading } = useSWR<{ topics: Topic[] }>(url, fetcher);
  if (isLoading) return <div className="text-center py-10">Loading topics…</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {data?.topics?.map((t) => <TopicCard key={t.id} {...t} />)}
    </div>
  );
}
