'use client';
import useSWR from 'swr';
import TopicCard from './TopicCard';
import type { Topic } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function TopicGrid() {
  const { data, isLoading } = useSWR('/api/topics?limit=12&shuffle=1', fetcher);

  if (isLoading) return <div className="text-center py-10">Loading topics…</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {data?.topics?.map((t: Topic) => (
        <TopicCard key={t.id} {...t} />
      ))}
    </div>
  );
}