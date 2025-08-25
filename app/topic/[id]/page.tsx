import { notFound } from 'next/navigation';
import TopicClient from '@/components/TopicClient';
import { demoTopics } from '@/lib/demoData';

export default async function TopicPage({ params }: { params?: Promise<{ id: string }> }) {
  const resolved = params ? await params : undefined;
  const topic = demoTopics.find(t => t.id === resolved?.id);
  if (!topic) return notFound();
  return <TopicClient topic={topic} />;
}
