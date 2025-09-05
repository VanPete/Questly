
import Link from 'next/link';
import TrackableLink from '@/components/TrackableLink';
import { getUpgradeHref } from '@/lib/upgrade';

//

export default function Page() {
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
          <Link href="/login" aria-label="Login or Sign up" className="px-5 py-3 rounded-2xl border focus-visible:outline-2 focus-visible:ring-amber-300">Login / Sign Up</Link>
          <Link href="/leaderboard" aria-label="Open leaderboard" className="px-5 py-3 rounded-2xl border focus-visible:outline-2 focus-visible:ring-amber-300">Leaderboard</Link>
          <TrackableLink href={getUpgradeHref()} data-analytics-cta="upgrade-cta" className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-black border border-amber-600/20 shadow-sm focus-visible:outline-2 focus-visible:ring-amber-300" eventName="upgrade_clicked">Upgrade</TrackableLink>
        </div>
  <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-3">Not signed in? <Link href="/login" className="underline">Sign in</Link> <span className="text-neutral-900 dark:text-neutral-50">to track your streaks, points, and lifetime stats.</span></p>
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
