
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import TrackableLink from '@/components/TrackableLink';
import { getUpgradeHref } from '@/lib/upgrade';
import { getAdminClient } from '@/lib/supabaseAdmin';
import LandingPremiumHydrator from '@/components/LandingPremiumHydrator';

// Force dynamic so we evaluate auth() per-request (avoid cached anonymous HTML)
export const dynamic = 'force-dynamic';

//


export default async function Page() {
  const { userId } = await auth();
  const signedIn = Boolean(userId);
  let isPremium = false;
  if (userId) {
    try {
      const supabase = getAdminClient();
      const { data } = await supabase.rpc('is_premium', { p_user_id: userId });
      if (typeof data === 'boolean') isPremium = data;
    } catch {/* ignore premium lookup errors to avoid blocking render */}
  }
  const questLine = isPremium ? '6 Daily Quests. Challenge your mind.' : '3 Daily Quests. Challenge your mind.';
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
        <p className="mb-8 italic text-neutral-700 dark:text-neutral-300 leading-snug max-w-[60ch] mx-auto">{questLine}</p>
  <div className="flex gap-3 justify-center" data-questly-premium-root>
          <TrackableLink href="/daily" data-analytics-cta="play-quests" className="px-5 py-3 rounded-2xl bg-black text-white focus-visible:outline-2 focus-visible:ring-amber-300" eventName="play_click">Start Quests</TrackableLink>
          <Link href="/leaderboard" aria-label="Open leaderboard" className="px-5 py-3 rounded-2xl border focus-visible:outline-2 focus-visible:ring-amber-300">Leaderboard</Link>
          {!isPremium && (
            <TrackableLink href={getUpgradeHref()} data-analytics-cta="upgrade-cta" className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-black border border-amber-600/20 shadow-sm focus-visible:outline-2 focus-visible:ring-amber-300" eventName="upgrade_clicked">Premium</TrackableLink>
          )}
          {isPremium && (
            <span className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 text-white border border-emerald-600/30 shadow-sm select-none" aria-label="Premium active">Premium Active</span>
          )}
        </div>
  {/* Client re-check ensures hydration update if server missed auth cookie */}
  <LandingPremiumHydrator />
        {!signedIn && (
          <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-3">Not signed in? <Link href="/login" className="underline">Sign in</Link> <span className="text-neutral-900 dark:text-neutral-50">to track your streaks, points, and lifetime stats.</span></p>
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
