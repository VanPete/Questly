import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

export async function GET() {
  const supabase = await getServerClient();
  // Get earliest and latest date in daily_topics
  const { data: minRow } = await supabase
    .from('daily_topics')
    .select('date')
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: maxRow } = await supabase
    .from('daily_topics')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!minRow?.date || !maxRow?.date) return NextResponse.json({ questNumber: null });
  const minDate = new Date(minRow.date);
  const today = new Date();
  // Count days since first quest (inclusive)
  const diff = Math.floor((today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
  return NextResponse.json({ questNumber: diff + 1 });
}