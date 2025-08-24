import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

export async function GET() {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('id, topic_id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversations: data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { topic_id, title } = body as { topic_id: string; title: string };
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from('conversations')
    .insert({ topic_id, title })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
