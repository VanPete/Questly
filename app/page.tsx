
import Link from 'next/link';
import TrackableLink from '@/components/TrackableLink';

import { Suspense } from 'react';

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
        <Suspense fallback={<DateLine questNumber={1} />}>
          <DateLineAsync />
        </Suspense>
        <p className="mb-8 italic text-neutral-700 dark:text-neutral-300">3 Daily Quests. Test your mind daily.</p>
        <div className="flex gap-3 justify-center">
          <TrackableLink href="/daily" className="px-5 py-3 rounded-2xl bg-black text-white" eventName="play_click">Quests</TrackableLink>
          <Link href="/login" className="px-5 py-3 rounded-2xl border">Login / Sign Up</Link>
          <Link href="/leaderboard" className="px-5 py-3 rounded-2xl border">Leaderboard</Link>
          <TrackableLink href="/upgrade" className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 text-black border border-amber-600/20 shadow-sm" eventName="upgrade_clicked">Upgrade</TrackableLink>
        </div>
        <p className="text-xs opacity-70 mt-3">Not signed in? <span className="opacity-90">Sign in to track your streaks, points, and lifetime stats.</span></p>
      </div>
    </main>
  );
}

async function DateLineAsync() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/quest-number`, { cache: 'no-store' });
  const { questNumber } = res.ok ? await res.json() : { questNumber: 1 };
  return <DateLine questNumber={questNumber || 1} />;
}

function DateLine({ questNumber }: { questNumber: number }) {
  const date = new Date();
  const formatted = date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  return <p className="mb-1 text-sm opacity-70">{formatted} — Quest #{questNumber}</p>;
}
