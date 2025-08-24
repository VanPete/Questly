import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

// GET /api/plans?topic_id=...
export async function GET(request: Request) {
  const supabase = await getServerClient();
  const { searchParams } = new URL(request.url);
  const topic_id = searchParams.get('topic_id');
  let query = supabase.from('learning_plans').select('id, topic_id, title, created_at');
  if (topic_id) query = query.eq('topic_id', topic_id);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plans: data });
}

// POST /api/plans { topic_id, title }
export async function POST(request: Request) {
  const supabase = await getServerClient();
  const body = await request.json();
  const { topic_id, title } = body as { topic_id: string; title: string };
  if (!topic_id || !title) return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  const { data, error } = await supabase.from('learning_plans').insert({ topic_id, title }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
