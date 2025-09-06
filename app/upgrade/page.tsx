"use client";
import { useEffect, useState } from 'react';

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [plan, setPlan] = useState<'free'|'premium'>('free');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/subscription', { credentials: 'include' });
        const js = await res.json().catch(()=>({}));
        if (!active) return;
        if (js?.plan === 'premium') setPlan('premium');
      } catch {}
    })();
    return () => { active = false; };
  }, []);
  const startCheckout = async () => {
    setLoading(true); setError(null);
    try {
      const link = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK;
      if (link) {
        try {
          const profRes = await fetch('/api/profile');
          const prof = await profRes.json().catch(() => ({}));
          const uid = prof?.profile?.id as string | undefined;
          const url = new URL(link as string);
          if (uid) url.searchParams.set('client_reference_id', uid);
          window.location.href = url.toString();
        } catch {
          window.location.href = link as string;
        }
        return;
      }
      const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (res.status === 401) {
        window.location.href = '/login?next=%2Fupgrade';
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'checkout_failed');
      window.location.href = data.url as string;
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const openPortal = async () => {
    setPortalLoading(true); setError(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      if (res.status === 401) {
        window.location.href = '/login?next=%2Fupgrade';
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'portal_failed');
      window.location.href = data.url as string;
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setPortalLoading(false);
    }
  }
  const perks = [
    { k: 'quests', label: '6 daily topics', active: plan==='premium' },
    { k: 'chats', label: '10 chats/day + history', active: plan==='premium' },
    { k: 'lifetime', label: 'Lifetime leaderboard', active: plan==='premium' },
    { k: 'streak', label: 'Streak insurance', active: plan==='premium' },
  ];

  return (
    <main className="min-h-[65vh] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{plan === 'premium' ? 'Premium Settings' : 'Go Premium'}</h1>
          <p className="opacity-80 text-sm">Unlock 6 daily topics, chat history, lifetime leaderboard & streak insurance.</p>
        </div>
        {error && <div className="text-red-600 text-sm mb-4 text-center">{error}</div>}
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          {perks.map(p => (
            <div key={p.k} className={`rounded-xl border p-4 flex items-center gap-3 text-sm ${p.active ? 'border-emerald-400/60 bg-emerald-50' : 'border-neutral-200 bg-white'}`}> 
              <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-semibold ${p.active ? 'bg-emerald-500 text-white' : 'bg-neutral-200 text-neutral-700'}`}>{p.active ? '✓' : '–'}</span>
              <span className={p.active ? 'font-medium text-emerald-800' : ''}>{p.label}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {plan === 'free' && (
            <button disabled={loading} onClick={startCheckout} className="px-6 py-3 rounded-2xl bg-black text-white disabled:opacity-60 text-sm font-semibold min-w-[160px]">
              {loading ? 'Starting…' : 'Upgrade'}
            </button>
          )}
          <button disabled={portalLoading} onClick={openPortal} className="px-6 py-3 rounded-2xl border border-black/20 disabled:opacity-60 text-sm font-semibold min-w-[160px] bg-white hover:bg-neutral-50">
            {portalLoading ? 'Opening…' : plan === 'premium' ? 'Manage billing' : 'Already subscribed?'}
          </button>
        </div>
        <div className="mt-8 text-center">
          <a href="/daily" className="text-xs underline opacity-80 hover:opacity-100">Continue {plan==='premium' ? 'learning' : 'without subscribing'}</a>
        </div>
      </div>
    </main>
  );
}
