import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

// GET /api/plan-tasks?plan_id=...
export async function GET(request: Request) {
  const supabase = await getServerClient();
  const { searchParams } = new URL(request.url);
  const plan_id = searchParams.get('plan_id');
  if (!plan_id) return NextResponse.json({ error: 'plan_id required' }, { status: 400 });
  const { data, error } = await supabase
    .from('plan_tasks')
    .select('id, plan_id, title, due_date, completed, order_index')
    .eq('plan_id', plan_id)
    .order('order_index', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tasks: data });
}

// POST /api/plan-tasks { plan_id, title, due_date, order_index }
export async function POST(request: Request) {
  const supabase = await getServerClient();
  const body = await request.json();
  const { plan_id, title, due_date, order_index } = body as { plan_id: string; title: string; due_date?: string; order_index?: number };
  if (!plan_id || !title) return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  const { data, error } = await supabase
    .from('plan_tasks')
    .insert({ plan_id, title, due_date, order_index: order_index ?? 0 })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

// PATCH /api/plan-tasks { id, completed }
export async function PATCH(request: Request) {
  const supabase = await getServerClient();
  const body = await request.json();
  const { id, completed } = body as { id: string; completed: boolean };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabase
    .from('plan_tasks')
    .update({ completed })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
