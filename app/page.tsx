
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import TrackableLink from '@/components/TrackableLink';
import { getUpgradeHref } from '@/lib/upgrade';
import React from 'react';

//

type SearchParams = Record<string, string | string[] | undefined>;
type MaybePromise<T> = T | Promise<T>;
interface PageProps { searchParams?: MaybePromise<SearchParams>; }

export default async function Page({ searchParams }: PageProps) {
  const { userId } = await auth();
  const signedIn = Boolean(userId);
  const sp: SearchParams | undefined = searchParams ? await (searchParams as MaybePromise<SearchParams>) : undefined;
  const showHealth = sp?.health === '1';
  let health: { ok: boolean; dbOk: boolean; urlConfigured: boolean; anonConfigured: boolean; durationMs: number; error: string | null } | null = null;
  if (showHealth) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/health`, { cache: 'no-store' });
      health = await res.json();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'fetch failed';
      health = { ok: false, dbOk: false, urlConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL, anonConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, durationMs: 0, error: msg };
    }
  }
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center text-center">
      <div>
        <div className="mx-auto mb-3 w-12 h-12 grid grid-cols-2 grid-rows-2 gap-0.5">
          <div className="bg-black/90 rounded-sm" />
          <div className="bg-yellow-400 rounded-sm" />
          <div className="bg-emerald-500 rounded-sm" />
          <div className="bg-rose-500 rounded-sm" />
        </div>
        <h1 className="text-4xl font-bold mb-2">Questly</h1>
        {/* Render quest number server-side to avoid client fallback flash */}
        <DateLineServer />
        <p className="mb-8 italic text-neutral-700 dark:text-neutral-300 leading-snug max-w-[60ch] mx-auto">3 Daily Quests. Challenge your mind.</p>
        <div className="flex gap-3 justify-center">
          <TrackableLink href="/daily" data-analytics-cta="play-quests" className="px-5 py-3 rounded-2xl bg-black text-white focus-visible:outline-2 focus-visible:ring-amber-300" eventName="play_click">Start Quests</TrackableLink>
          <Link href="/leaderboard" aria-label="Open leaderboard" className="px-5 py-3 rounded-2xl border focus-visible:outline-2 focus-visible:ring-amber-300">Leaderboard</Link>
          <TrackableLink href={getUpgradeHref()} data-analytics-cta="upgrade-cta" className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-black border border-amber-600/20 shadow-sm focus-visible:outline-2 focus-visible:ring-amber-300" eventName="upgrade_clicked">Premium</TrackableLink>
        </div>
        {!signedIn && (
          <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-3">Not signed in? <Link href="/login" className="underline">Sign in</Link> <span className="text-neutral-900 dark:text-neutral-50">to track your streaks, points, and lifetime stats.</span></p>
        )}
        {showHealth && (
          <div className="mt-8 max-w-md mx-auto text-left border rounded-lg p-4 text-sm bg-white/60 dark:bg-neutral-900/60 backdrop-blur">
            <h2 className="font-semibold mb-2">Supabase Health</h2>
            {health ? (
              <ul className="space-y-1">
                <li>Status: <span className={health.ok ? 'text-emerald-600' : 'text-rose-600'}>{health.ok ? 'OK' : 'FAIL'}</span></li>
                <li>DB Query: {health.dbOk ? 'ok' : 'fail'}</li>
                <li>URL Env: {health.urlConfigured ? 'present' : 'missing'}</li>
                <li>Anon Key Env: {health.anonConfigured ? 'present' : 'missing'}</li>
                <li>Latency: {health.durationMs} ms</li>
                {health.error && <li className="text-rose-600">Error: {health.error}</li>}
                <li className="pt-2 opacity-70">Remove ?health=1 when done. Endpoint: /api/health</li>
              </ul>
            ) : (
              <p>Loading…</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

async function DateLineServer() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/quest-number`, { cache: 'no-store' });
  const { questNumber } = res.ok ? await res.json() : { questNumber: 1 };
  return <DateLine questNumber={questNumber || 1} />;
}

function DateLine({ questNumber }: { questNumber: number }) {
  const date = new Date();
  const formatted = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return <p className="mb-1 text-sm opacity-70">{formatted} — Quest #{questNumber}</p>;
}
