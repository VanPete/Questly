'use client';
import { useEffect, useState } from 'react';
import TopicFlow from './TopicFlow';
import ChatPane from './ChatPane';
import { track } from '@vercel/analytics';
import type { Topic } from '@/lib/types';

export default function TopicClient({ topic }: { topic: Topic }) {
  const [autoSummarize, setAutoSummarize] = useState(false);
  useEffect(() => {
    if (topic) track('topic_view', { topicId: topic.id });
  }, [topic]);

  return (
    <main className="space-y-6">
      <TopicFlow topic={topic} onCompleted={() => setAutoSummarize(true)} />
  <div id="chat">
        <h4 className="font-semibold mb-2">Chat</h4>
        <ChatPane topic={topic} autoSummarize={autoSummarize} />
      </div>
    </main>
  );
}
