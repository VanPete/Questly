'use client';
import { useEffect } from 'react';
import TopicFlow from './TopicFlow';
import ChatPane from './ChatPane';
import { track } from '@vercel/analytics';
import type { Topic } from '@/lib/types';

export default function TopicClient({ topic }: { topic: Topic }) {
  useEffect(() => {
    if (topic) track('topic_view', { topicId: topic.id });
  }, [topic]);

  return (
    <main className="space-y-6">
        <TopicFlow topic={topic} />
      <section aria-labelledby="topic-summary-title">
        <h4 id="topic-summary-title" className="font-semibold mb-2">Topic Summary</h4>
        {/* The initial summary points and angles are displayed within TopicFlow's summary step.
            This section header clarifies the area on the page. */}
      </section>

      <section aria-labelledby="chat-gpt-title" id="chat">
        <h4 id="chat-gpt-title" className="font-semibold mb-2">Chat with GPT to learn more</h4>
        <ChatPane topic={topic} />
      </section>
    </main>
  );
}
