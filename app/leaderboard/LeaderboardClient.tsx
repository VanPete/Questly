"use client";
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';

async function fetchDaily() {
  const res = await fetch(`/api/leaderboard/daily`);
  if (!res.ok) return { date: new Date().toISOString().slice(0,10), results: [] };
  return res.json();
}

async function fetchLifetime() {
  const res = await fetch(`/api/leaderboard/lifetime`);
  if (res.status === 401) return { authRequired: true } as const;
  if (res.status === 403) return { premiumRequired: true } as const;
  if (!res.ok) return { results: [] };
  return res.json();
}

export default function LeaderboardClient() {
  const today = new Date().toISOString().slice(0, 10);
  type LeaderboardResult = { user_id: string; name?: string | null; rank: number; points: number; is_me?: boolean };
  const [daily, setDaily] = useState<{ date: string; results: LeaderboardResult[]; me?: LeaderboardResult | null }>({ date: today, results: [] });
  type LifetimeLeaderboard = { results: LeaderboardResult[]; me?: LeaderboardResult | null } | { premiumRequired: true } | { authRequired: true };
  const [lifetime, setLifetime] = useState<LifetimeLeaderboard>({ results: [] });
  const { isSignedIn } = useUser();

  type StreakResult = { user_id: string; name?: string | null; rank: number; streak?: number; longest_streak?: number; is_me?: boolean };
  const [streaks, setStreaks] = useState<{ current: StreakResult[]; alltime: StreakResult[]; me_current?: StreakResult | null; me_alltime?: StreakResult | null }>({ current: [], alltime: [] });

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

  function renderBoard(title: string, items: LeaderboardResult[], variant: 'daily'|'lifetime', lock?: 'premium'|'auth') {
    const accent = variant === 'daily' ? 'from-amber-300/60 via-amber-400/40 to-amber-500/30' : 'from-emerald-300/50 via-emerald-400/30 to-emerald-500/20';
    return (
      <div className="relative rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/40 backdrop-blur-sm shadow-sm flex flex-col overflow-hidden">
        <div className={`px-5 py-3 bg-gradient-to-r ${accent} dark:from-neutral-800 dark:via-neutral-800 dark:to-neutral-900 border-b border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between`}> 
          <h2 className="text-sm font-semibold tracking-wide uppercase opacity-80">{title}</h2>
          <span className="text-xs opacity-60">{variant === 'daily' ? new Date(daily.date+ 'T00:00:00').toLocaleDateString(undefined,{year:'numeric', month:'long', day:'numeric'}) : 'All time'}</span>
        </div>
        <ol className="divide-y divide-neutral-200/70 dark:divide-neutral-800 flex-1">
          {lock === 'auth' && (
            <li className="p-5 text-sm opacity-80 flex flex-col gap-3">
              <div>Sign in to view lifetime rankings and compete.</div>
              <div className="flex gap-2">
                <a href="/login" className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-medium hover:bg-black dark:bg-neutral-800 dark:hover:bg-neutral-700 transition">Sign In</a>
                <a href={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || '/upgrade'} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-600 text-white text-xs font-medium shadow hover:opacity-90 transition">Upgrade</a>
              </div>
            </li>
          )}
          {lock === 'premium' && (
            <li className="p-5 text-sm opacity-80 flex flex-col gap-3">
              <div>Upgrade to Premium to unlock lifetime leaderboards.</div>
              <div className="flex gap-2">
                {!isSignedIn && <a href="/login" className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-medium hover:bg-black dark:bg-neutral-800 dark:hover:bg-neutral-700 transition">Sign In</a>}
                <a href={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || '/upgrade'} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-600 text-white text-xs font-medium shadow hover:opacity-90 transition">Upgrade</a>
              </div>
            </li>
          )}
          {!lock && items.length === 0 && (
            <li className="p-5 text-sm opacity-80 flex flex-col gap-2">
              {variant === 'daily' ? (
                isSignedIn ? <span>No results yet — complete a quest to appear.</span> : <span>Sign in to start earning points and appear on today&apos;s leaderboard.</span>
              ) : (
                isSignedIn ? <span>No lifetime data yet — earn points to begin ranking.</span> : <span>Sign in or upgrade to participate in lifetime leaderboards.</span>
              )}
              {!isSignedIn && (
                <div className="flex gap-2">
                  <a href="/login" className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-medium hover:bg-black dark:bg-neutral-800 dark:hover:bg-neutral-700 transition">Sign In</a>
                  <a href={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || '/upgrade'} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-600 text-white text-xs font-medium shadow hover:opacity-90 transition">Upgrade</a>
                </div>
              )}
            </li>
          )}
          {!lock && items.map(r => (
            <li key={r.user_id} className={`px-5 py-2.5 flex items-center justify-between hover:bg-neutral-50/80 dark:hover:bg-neutral-800/30 transition-colors ${r.is_me ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
              <div className="flex items-center gap-3 min-w-0">
                <RankBadge rank={r.rank} />
                <span className="truncate text-sm font-medium">{r.name || r.user_id.slice(0,8)}</span>
              </div>
              <div className="text-sm font-semibold tabular-nums">{r.points}<span className="opacity-60 text-xs font-normal ml-1">pts</span></div>
            </li>
          ))}
          {/* If the API provided a 'me' row and I'm not in Top 10, show it below with a separator */}
          {(() => {
            const me: LeaderboardResult | undefined = variant === 'daily'
              ? daily.me || undefined
              : ('results' in lifetime ? (lifetime as { results: LeaderboardResult[]; me?: LeaderboardResult | null }).me || undefined : undefined);
            if (!lock && me && me.rank > 10) {
              return (
                <>
                  <li className="py-1"><hr className="border-neutral-200/70 dark:border-neutral-800" /></li>
                  <li key={`${variant}-me`} className="px-5 py-2.5 flex items-center justify-between bg-amber-50/60 dark:bg-amber-900/10">
                    <div className="flex items-center gap-3 min-w-0">
                      <RankBadge rank={me.rank} />
                      <span className="truncate text-sm font-medium">{me.name || me.user_id.slice(0,8)} <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">You</span></span>
                    </div>
                    <div className="text-sm font-semibold tabular-nums">{me.points}<span className="opacity-60 text-xs font-normal ml-1">pts</span></div>
                  </li>
                </>
              );
            }
            return null;
          })()}
        </ol>
      </div>
    );
  }

  function renderStreaks() {
    // Merge current + all-time into single section if identical sets
    const showMerged = streaks.current.length === streaks.alltime.length && streaks.current.every((c,i)=>c.user_id===streaks.alltime[i]?.user_id && c.streak === streaks.alltime[i]?.longest_streak);
    if (showMerged) {
      return (
        <div className="mt-10">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white/60 dark:bg-neutral-900/40 backdrop-blur-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 opacity-70">Current Streaks</h3>
            <ol className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
              {streaks.current.length === 0 && <li className="py-2 text-xs opacity-70">No data yet.</li>}
              {streaks.current.map(r => (
                <li key={r.user_id} className={`py-2 flex items-center justify-between text-sm ${r.is_me ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <RankBadge rank={r.rank} small />
                    <span className="truncate">{r.name || r.user_id.slice(0,8)}</span>
                  </div>
                  <span className="tabular-nums font-medium">{r.streak}</span>
                </li>
              ))}
              {streaks.me_current && streaks.current.every(r => r.user_id !== streaks.me_current!.user_id) && (
                <>
                  <li className="py-1"><hr className="border-neutral-200/60 dark:border-neutral-800" /></li>
                  <li className="py-2 flex items-center justify-between text-sm bg-amber-50/60 dark:bg-amber-900/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <RankBadge rank={streaks.me_current.rank} small />
                      <span className="truncate">{streaks.me_current.name || streaks.me_current.user_id.slice(0,8)} <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">You</span></span>
                    </div>
                    <span className="tabular-nums font-medium">{streaks.me_current.streak}</span>
                  </li>
                </>
              )}
            </ol>
          </div>
        </div>
      );
    }
    return (
      <div className="mt-10 grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white/60 dark:bg-neutral-900/40 backdrop-blur-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 opacity-70">Current Streaks</h3>
          <ol className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
            {streaks.current.length === 0 && <li className="py-2 text-xs opacity-70">No data yet.</li>}
            {streaks.current.map(r => (
              <li key={r.user_id} className={`py-2 flex items-center justify-between text-sm ${r.is_me ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <RankBadge rank={r.rank} small />
                  <span className="truncate">{r.name || r.user_id.slice(0,8)}</span>
                </div>
                <span className="tabular-nums font-medium">{r.streak}</span>
              </li>
            ))}
            {streaks.me_current && streaks.current.every(r => r.user_id !== streaks.me_current!.user_id) && (
              <>
                <li className="py-1"><hr className="border-neutral-200/60 dark:border-neutral-800" /></li>
                <li className="py-2 flex items-center justify-between text-sm bg-amber-50/60 dark:bg-amber-900/10">
                  <div className="flex items-center gap-2 min-w-0">
                    <RankBadge rank={streaks.me_current.rank} small />
                    <span className="truncate">{streaks.me_current.name || streaks.me_current.user_id.slice(0,8)} <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">You</span></span>
                  </div>
                  <span className="tabular-nums font-medium">{streaks.me_current.streak}</span>
                </li>
              </>
            )}
          </ol>
        </div>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white/60 dark:bg-neutral-900/40 backdrop-blur-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 opacity-70">All-Time Longest Streaks</h3>
            <ol className="divide-y divide-neutral-200/60 dark:divide-neutral-800">
              {streaks.alltime.length === 0 && <li className="py-2 text-xs opacity-70">No data yet.</li>}
              {streaks.alltime.map(r => (
                <li key={r.user_id} className={`py-2 flex items-center justify-between text-sm ${r.is_me ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <RankBadge rank={r.rank} small />
                    <span className="truncate">{r.name || r.user_id.slice(0,8)}</span>
                  </div>
                  <span className="tabular-nums font-medium">{r.longest_streak}</span>
                </li>
              ))}
              {streaks.me_alltime && streaks.alltime.every(r => r.user_id !== streaks.me_alltime!.user_id) && (
                <>
                  <li className="py-1"><hr className="border-neutral-200/60 dark:border-neutral-800" /></li>
                  <li className="py-2 flex items-center justify-between text-sm bg-amber-50/60 dark:bg-amber-900/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <RankBadge rank={streaks.me_alltime.rank} small />
                      <span className="truncate">{streaks.me_alltime.name || streaks.me_alltime.user_id.slice(0,8)} <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">You</span></span>
                    </div>
                    <span className="tabular-nums font-medium">{streaks.me_alltime.longest_streak}</span>
                  </li>
                </>
              )}
            </ol>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Questly <span className="bg-gradient-to-r from-amber-400 via-emerald-400 to-rose-400 bg-clip-text text-transparent">Leaderboard</span></h1>
        <p className="text-xs md:text-sm opacity-70 max-w-xl mx-auto font-medium">Daily resets at midnight ET. Earn points by completing topic quizzes; premium users compete on lifetime totals.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-8 items-start">
        {renderBoard('Daily', daily.results, 'daily')}
        {renderBoard(
          'Lifetime',
          'results' in lifetime ? lifetime.results : [],
          'lifetime',
          'premiumRequired' in lifetime ? 'premium' : ('authRequired' in lifetime ? 'auth' : undefined)
        )}
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