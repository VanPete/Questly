'use client';
import { useEffect, useState } from 'react';
import { getUpgradeHref } from '@/lib/upgrade';

export default function PremiumHint() {
  const [plan, setPlan] = useState<'free'|'premium'|'unknown'>('unknown');
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    fetch('/api/subscription').then(r=>r.json()).then(d=>{
      setPlan(d.plan === 'premium' ? 'premium' : 'free');
    }).catch(()=>setPlan('free'));
  }, []);
  if (plan !== 'free' || dismissed) return null;
  return (
    <div className="relative mb-4 text-sm p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
      <button
        aria-label="Dismiss premium hint"
        className="absolute top-2 right-2 rounded-md p-1 text-amber-900/70 hover:text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        onClick={() => setDismissed(true)}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
      </button>
  Unlock 3 extra quest tiles daily, lifetime leaderboard, and 10 daily chats. <a href={getUpgradeHref()} className="underline font-medium">Upgrade</a>
    </div>
  );
}
