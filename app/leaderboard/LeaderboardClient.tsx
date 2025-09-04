"use client";
import { useState, useEffect } from 'react';

async function fetchDaily(date?: string) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const today = new Date().toISOString().slice(0, 10);
  if (date && date !== today) {
    const res = await fetch(`/api/leaderboard/daily-snapshot${qs}`);
    if (!res.ok) return { date, results: [] };
    return res.json();
  }
  const res = await fetch(`/api/leaderboard/daily${qs}`);
  if (!res.ok) return { date: date || today, results: [] };
  return res.json();
}

async function fetchLifetime() {
  const res = await fetch(`/api/leaderboard/lifetime`);
  if (res.status === 403) return { premiumRequired: true } as const;
  if (!res.ok) return { results: [] };
  return res.json();
}

export default function LeaderboardClient() {
  const today = new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });
  const [date, setDate] = useState(today);
  type LeaderboardResult = { user_id: string; name?: string | null; rank: number; points: number };
  const [daily, setDaily] = useState<{ date: string; results: LeaderboardResult[] }>({ date: today, results: [] });
  type LifetimeLeaderboard = { results: LeaderboardResult[] } | { premiumRequired: true };
  const [lifetime, setLifetime] = useState<LifetimeLeaderboard>({ results: [] });

  type StreakResult = { user_id: string; name?: string | null; rank: number; streak?: number; longest_streak?: number };
  const [streaks, setStreaks] = useState<{ current: StreakResult[]; alltime: StreakResult[] }>({ current: [], alltime: [] });

  useEffect(() => {
    fetchDaily(date).then(setDaily);
  }, [date]);
  useEffect(() => {
    fetchLifetime().then(setLifetime);
  }, []);

  useEffect(() => {
    async function fetchStreaks() {
      const res = await fetch('/api/leaderboard/streaks');
      if (!res.ok) {
        setStreaks({ current: [], alltime: [] });
        return;
      }
      setStreaks(await res.json());
    }
    fetchStreaks();
  }, []);

  return (
    <>
      <h1 className="text-2xl font-semibold mb-4">Daily Leaderboard</h1>
      <div className="mb-2 flex items-center gap-2">
        <span className="opacity-80">{daily.date}</span>
        <label htmlFor="date-picker" className="sr-only">Leaderboard date</label>
        <select id="date-picker" value={date} onChange={e => setDate(e.target.value)} className="border rounded px-2 py-1 text-sm">
          {days.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      {daily.results.length === 0 ? (
        <p className="opacity-70">No results yet. Come back after today’s quests!</p>
      ) : (
        <ul className="divide-y">
          {daily.results.map((r: { user_id: string; name?: string|null; rank: number; points: number }) => (
            <li key={r.user_id} className="py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-6 text-right">{r.rank}</span>
                <span className="text-sm opacity-80">{r.name || r.user_id.slice(0,8)}</span>
              </div>
              <div className="text-sm">{r.points} pts</div>
            </li>
          ))}
        </ul>
)}

      <h2 className="text-xl font-semibold mt-8 mb-2">Lifetime Leaderboard</h2>
      {'premiumRequired' in lifetime ? (
        <p className="opacity-80 text-sm">Premium required to view lifetime rankings. <a href="/upgrade" className="underline">Upgrade</a></p>
      ) : (
        (lifetime.results?.length ? (
          <ul className="divide-y">
            {lifetime.results.map((r: { user_id: string; name?: string|null; rank: number; points: number }) => (
              <li key={r.user_id} className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right">{r.rank}</span>
                  <span className="text-sm opacity-80">{r.name || r.user_id.slice(0,8)}</span>
                </div>
                <div className="text-sm">{r.points} pts</div>
              </li>
            ))}
          </ul>
        ) : <p className="opacity-70 text-sm">No lifetime results yet.</p>)
      )}

      <h2 className="text-xl font-semibold mt-8 mb-2">Streaks</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <div className="font-semibold mb-1">Current Streaks</div>
          <ul className="divide-y">
            {streaks.current.length === 0 && <li className="text-sm opacity-70">No data yet.</li>}
            {streaks.current.map((r) => (
              <li key={r.user_id} className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right">{r.rank}</span>
                  <span className="text-sm opacity-80">{r.name || r.user_id.slice(0,8)}</span>
                </div>
                <div className="text-sm">{r.streak}</div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-1">All-Time Longest Streaks</div>
          <ul className="divide-y">
            {streaks.alltime.length === 0 && <li className="text-sm opacity-70">No data yet.</li>}
            {streaks.alltime.map((r) => (
              <li key={r.user_id} className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right">{r.rank}</span>
                  <span className="text-sm opacity-80">{r.name || r.user_id.slice(0,8)}</span>
                </div>
                <div className="text-sm">{r.longest_streak}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}