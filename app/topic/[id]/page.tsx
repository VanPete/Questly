"use client";
import { notFound } from 'next/navigation';
import ChatPane from '@/components/ChatPane';
import TopicFlow from '@/components/TopicFlow';
import { demoTopics } from '@/lib/demoData';
import { useEffect } from 'react';
import { track } from '@vercel/analytics';

export default function TopicPage({ params }: { params: { id: string } }) {
  const topic = demoTopics.find(t => t.id === params.id);
  useEffect(() => {
    if (topic) track('topic_view', { topicId: topic.id });
  }, [topic]);
  if (!topic) return notFound();
  return (
    <main className="space-y-6">
      <TopicFlow topic={topic} />
      <div>
        <h4 className="font-semibold mb-2">Chat</h4>
        <ChatPane topic={topic} />
      </div>
    </main>
  );
}
