import { NextResponse } from 'next/server';

export async function GET() {
  // Base the quest numbering on a fixed start date in America/New_York.
  // Quest #1 is September 1, 2025 (inclusive), then +1 each calendar day.
  const tz = 'America/New_York';
  const baseStr = '2025-09-01';

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = fmt.format(new Date()); // YYYY-MM-DD in ET

  const toUTCDate = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(n => parseInt(n, 10));
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  };

  const baseUTC = toUTCDate(baseStr);
  const todayUTC = toUTCDate(todayStr);
  let diffDays = Math.floor((todayUTC.getTime() - baseUTC.getTime()) / 86400000) + 1;
  if (!Number.isFinite(diffDays) || diffDays < 1) diffDays = 1;
  return NextResponse.json({ questNumber: diffDays });
}