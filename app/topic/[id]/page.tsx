import { notFound } from 'next/navigation';
import ChatPane from '@/components/ChatPane';
import { demoTopics } from '@/lib/demoData';

export default function TopicPage({ params }: { params: { id: string } }) {
  const topic = demoTopics.find(t => t.id === params.id);
  if (!topic) return notFound();
  return (
    <main>
      <h2 className="text-2xl font-semibold mb-2">{topic.title}</h2>
      <p className="opacity-80 mb-4">{topic.blurb}</p>
      <ChatPane topic={topic} />
    </main>
  );
}
