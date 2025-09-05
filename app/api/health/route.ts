import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  const urlConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonConfigured = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let dbOk = false;
  let error: string | null = null;
  try {
    if (!urlConfigured || !anonConfigured) {
      throw new Error('Supabase anon env vars missing');
    }
    const supa = await getServerClient();
    // Lightweight head query (no row payload) just to ensure connectivity & auth
    const { error: headErr } = await supa
      .from('topics')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    if (headErr) throw headErr;
    dbOk = true;
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : 'unknown error';
  }
  const durationMs = Date.now() - started;
  const body = { ok: dbOk && urlConfigured && anonConfigured, dbOk, urlConfigured, anonConfigured, durationMs, time: new Date().toISOString(), error };
  return NextResponse.json(body, { status: body.ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
