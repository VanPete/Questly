import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const conversation_id = searchParams.get('conversation_id');
  if (!conversation_id) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 });
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { conversation_id, role, content } = body as { conversation_id: string; role: string; content: string };
  if (!conversation_id || !role || !content) return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id, role, content });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
