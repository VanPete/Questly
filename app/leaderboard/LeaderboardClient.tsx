"use client";
import { useState, useEffect } from 'react';

async function fetchDaily() {
  const res = await fetch(`/api/leaderboard/daily`);
  if (!res.ok) return { date: new Date().toISOString().slice(0,10), results: [] };
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
  type LeaderboardResult = { user_id: string; name?: string | null; rank: number; points: number };
  const [daily, setDaily] = useState<{ date: string; results: LeaderboardResult[] }>({ date: today, results: [] });
  type LifetimeLeaderboard = { results: LeaderboardResult[] } | { premiumRequired: true };
  const [lifetime, setLifetime] = useState<LifetimeLeaderboard>({ results: [] });

  type StreakResult = { user_id: string; name?: string | null; rank: number; streak?: number; longest_streak?: number };
  const [streaks, setStreaks] = useState<{ current: StreakResult[]; alltime: StreakResult[] }>({ current: [], alltime: [] });

  useEffect(() => { fetchDaily().then(setDaily); }, []);
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

  function renderBoard(title: string, items: LeaderboardResult[], variant: 'daily'|'lifetime', premiumLocked: boolean) {
    const accent = variant === 'daily' ? 'from-amber-300/60 via-amber-400/40 to-amber-500/30' : 'from-emerald-300/50 via-emerald-400/30 to-emerald-500/20';
    return (
      <div className="relative rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/40 backdrop-blur-sm shadow-sm flex flex-col overflow-hidden">
        <div className={`px-5 py-3 bg-gradient-to-r ${accent} dark:from-neutral-800 dark:via-neutral-800 dark:to-neutral-900 border-b border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between`}> 
          <h2 className="text-sm font-semibold tracking-wide uppercase opacity-80">{title}</h2>
          <span className="text-xs opacity-60">{variant === 'daily' ? daily.date : 'All time'}</span>
        </div>
        <ol className="divide-y divide-neutral-200/70 dark:divide-neutral-800 flex-1">
          {premiumLocked && (
            <li className="p-5 text-sm opacity-80 flex flex-col gap-2">
              <span>Premium required to view lifetime rankings.</span>
              <a href={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || '/upgrade'} className="inline-block self-start px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-600 text-white text-xs font-medium shadow">Upgrade</a>
            </li>
          )}
          {!premiumLocked && items.length === 0 && (
            <li className="p-5 text-sm opacity-70">No results yet.</li>
          )}
          {!premiumLocked && items.map(r => (
            <li key={r.user_id} className="px-5 py-2.5 flex items-center justify-between hover:bg-neutral-50/80 dark:hover:bg-neutral-800/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <RankBadge rank={r.rank} />
                <span className="truncate text-sm font-medium">{r.name || r.user_id.slice(0,8)}</span>
              </div>
              <div className="text-sm font-semibold tabular-nums">{r.points}<span className="opacity-60 text-xs font-normal ml-1">pts</span></div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  function renderStreaks() {
    return (
      <div className="mt-10 grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white/60 dark:bg-neutral-900/40 backdrop-blur-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 opacity-70">Current Streaks</h3>
          <ol className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
            {streaks.current.length === 0 && <li className="py-2 text-xs opacity-70">No data yet.</li>}
            {streaks.current.map(r => (
              <li key={r.user_id} className="py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <RankBadge rank={r.rank} small />
                  <span className="truncate">{r.name || r.user_id.slice(0,8)}</span>
                </div>
                <span className="tabular-nums font-medium">{r.streak}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white/60 dark:bg-neutral-900/40 backdrop-blur-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 opacity-70">All-Time Longest Streaks</h3>
          <ol className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
            {streaks.alltime.length === 0 && <li className="py-2 text-xs opacity-70">No data yet.</li>}
            {streaks.alltime.map(r => (
              <li key={r.user_id} className="py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <RankBadge rank={r.rank} small />
                  <span className="truncate">{r.name || r.user_id.slice(0,8)}</span>
                </div>
                <span className="tabular-nums font-medium">{r.longest_streak}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-amber-500 via-rose-500 to-emerald-500 bg-clip-text text-transparent">Leaderboard</h1>
        <p className="text-sm opacity-70 max-w-xl mx-auto">Daily resets at midnight ET. Earn points by completing topic quizzes; premium users compete on lifetime totals.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-8 items-start">
        {renderBoard('Daily', daily.results, 'daily', false)}
        {renderBoard('Lifetime', 'premiumRequired' in lifetime ? [] : lifetime.results, 'lifetime', 'premiumRequired' in lifetime)}
      </div>
      {renderStreaks()}
    </div>
  );
}

function RankBadge({ rank, small }: { rank: number; small?: boolean }) {
  const base = small ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs';
  const medal = rank === 1 ? 'bg-gradient-to-br from-yellow-200 to-yellow-500 text-yellow-900 border-yellow-600/40' : rank === 2 ? 'bg-gradient-to-br from-neutral-200 to-neutral-400 text-neutral-800 border-neutral-500/40' : rank === 3 ? 'bg-gradient-to-br from-amber-700 to-amber-900 text-amber-50 border-amber-900/40' : 'bg-neutral-200/70 dark:bg-neutral-700/60 text-neutral-800 dark:text-neutral-200 border-neutral-300/60 dark:border-neutral-600/60';
  return (
    <span className={`flex items-center justify-center rounded-full border font-semibold shrink-0 ${base} ${medal}`}>{rank}</span>
  );
}