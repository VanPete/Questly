import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';

function todayInTimeZoneISODate(tz: string) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(now);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const date = url.searchParams.get('date') || todayInTimeZoneISODate('America/New_York');
  const admin = getAdminClient();
  const { data: row, error: rowError } = await admin
    .from('daily_topics')
    .select('*')
    .eq('date', date)
    .maybeSingle();
  const { data: freeIds, error: funcErrFree } = await admin.rpc('get_daily_topic_ids', { p_date: date, p_is_premium: false });
  const { data: premiumIds, error: funcErrPrem } = await admin.rpc('get_daily_topic_ids', { p_date: date, p_is_premium: true });
  return NextResponse.json({
    date,
    envUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    row,
    rowError: rowError?.message,
    function: { freeIds, funcErrFree: funcErrFree?.message, premiumIds, funcErrPrem: funcErrPrem?.message },
  });
}
