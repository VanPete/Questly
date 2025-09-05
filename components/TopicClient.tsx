'use client';
import { useEffect } from 'react';
import TopicFlow from './TopicFlow';
import { track } from '@vercel/analytics';
import type { Topic } from '@/lib/types';

export default function TopicClient({ topic }: { topic: Topic }) {
  useEffect(() => {
    if (topic) track('topic_view', { topicId: topic.id });
  }, [topic]);

  return (
    <main className="space-y-6">
  <TopicFlow topic={topic} />
    </main>
  );
}
