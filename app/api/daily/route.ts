import { NextResponse } from 'next/server';
import { demoTopics } from '@/lib/demoData';

export async function GET() {
  // Simple curated selection: 1 Beginner, 1 Intermediate, 1 Advanced
  const pick = (difficulty: string) => demoTopics.filter(t => t.difficulty === difficulty)[0];
  const tiles = [pick('Beginner'), pick('Intermediate'), pick('Advanced')].filter(Boolean);
  return NextResponse.json({ tiles });
}
