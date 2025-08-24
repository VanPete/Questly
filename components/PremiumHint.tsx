'use client';
import { useEffect, useState } from 'react';

export default function PremiumHint() {
  const [plan, setPlan] = useState<'free'|'premium'|'unknown'>('unknown');
  useEffect(() => {
    fetch('/api/subscription').then(r=>r.json()).then(d=>{
      setPlan(d.plan === 'premium' ? 'premium' : 'free');
    }).catch(()=>setPlan('free'));
  }, []);
  if (plan !== 'free') return null;
  return (
    <div className="mb-4 text-sm p-3 rounded-lg border bg-amber-50">
      Unlock 3 extra tiles daily, lifetime leaderboard, and unlimited chat. <a href="/upgrade" className="underline">Upgrade</a>
    </div>
  );
}
