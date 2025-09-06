import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'supabase env missing' }, { status: 500 });
  }

  async function probe(kind: 'anon' | 'service') {
  const keyMaybe = kind === 'anon' ? anonKey : serviceKey;
  if (!keyMaybe) return { ok: false, reason: 'missing_key' };
  const key: string = keyMaybe; // narrowed
  const client = createClient(supabaseUrl!, key, { auth: { persistSession: false } });
    try {
      // Attempt select on daily_topics
      const { data, error } = await client.from('daily_topics').select('date').limit(1);
      let functionTest: unknown = null;
      let functionError: string | null = null;
      try {
        const { data: fdata, error: ferr } = await client.rpc('get_daily_topic_ids', { p_date: '2025-09-05', p_is_premium: false });
        functionTest = fdata;
        functionError = ferr?.message || null;
      } catch (e) {
        functionError = (e as Error).message;
      }
      return {
        ok: !error,
        row: data && data.length ? data[0] : null,
        error: error?.message || null,
        functionTest,
        functionError,
      };
    } catch (e) {
      return { ok: false, exception: (e as Error).message };
    }
  }

  const anonProbe = await probe('anon');
  const serviceProbe = await probe('service');

  return NextResponse.json({
    supabaseUrlPresent: !!supabaseUrl,
    anonKeyLen: anonKey?.length || 0,
    serviceKeyLen: serviceKey?.length || 0,
    anon: anonProbe,
    service: serviceProbe,
  });
}
