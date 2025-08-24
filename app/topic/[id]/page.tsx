import { notFound } from 'next/navigation';
import TopicClient from '@/components/TopicClient';
import { demoTopics } from '@/lib/demoData';

export default function TopicPage({ params }: { params: { id: string } }) {
  const topic = demoTopics.find(t => t.id === params.id);
  if (!topic) return notFound();
  return <TopicClient topic={topic} />;
}
