import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';
import { demoTopics } from '@/lib/demoData';
import { fetchDailyTopics } from '@/lib/supabaseClient';

// GET /api/topics?date=YYYY-MM-DD
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  await getServerClient(); // ensures auth cookies are available for server client if needed elsewhere

  try {
    // Use the shared helper which reads daily_topics and joins topics
    const daily = await fetchDailyTopics(date as string | undefined);
    if (daily && daily.length > 0) {
      return NextResponse.json({ topics: daily });
    }
  } catch {
    // ignore and fallback
  }

  // Fallback: return seeded demo topics
  const pick = (difficulty: string) => demoTopics.find(t => t.difficulty === difficulty);
  const tiles = [pick('Beginner'), pick('Intermediate'), pick('Advanced')].filter(Boolean);
  return NextResponse.json({ topics: tiles });
}
