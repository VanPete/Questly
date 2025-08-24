import { NextResponse } from 'next/server';
import { demoTopics } from '@/lib/demoData';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? '12');
  const shuffle = searchParams.get('shuffle') === '1';

  let topics = [...demoTopics];
  if (shuffle) topics.sort(() => Math.random() - 0.5);
  topics = topics.slice(0, limit);

  return NextResponse.json({ topics });
}
