'use client';
import { useEffect, useState } from 'react';

// Displays a live countdown until the next daily rotation (midnight ET).
export default function RotationCountdown() {
  const [ms, setMs] = useState<number>(() => calcMs());

  useEffect(() => {
    const id = setInterval(() => setMs(calcMs()), 1000);
    return () => clearInterval(id);
  }, []);

  if (ms <= 0) return <span className="text-amber-600" title="Waiting for next rotation">Rotating…</span>;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return <span title="Time until midnight America/New_York when quests rotate">Next rotation in {h}:{m}:{s} (ET)</span>;
}

function calcMs(): number {
  const now = Date.now();
  const tz = 'America/New_York';
  // Derive current ET offset in hours (e.g. GMT-4 or GMT-5)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset', hour: '2-digit' }).formatToParts(now);
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
  const offsetHours = parseInt(tzName.replace('GMT', ''), 10); // negative number
  // Convert current time to ET by adding offset hours.
  const nowEtMs = now + offsetHours * 3600 * 1000;
  const etDate = new Date(nowEtMs);
  const nextMidnightEt = Date.UTC(etDate.getUTCFullYear(), etDate.getUTCMonth(), etDate.getUTCDate() + 1, 0, 0, 0);
  const nextMidnightUtc = nextMidnightEt - offsetHours * 3600 * 1000; // convert back to UTC ms
  return nextMidnightUtc - now;
}
