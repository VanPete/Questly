"use client";
import { useState } from 'react';

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
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
  return (
    <main className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">Go Premium</h1>
  <p className="opacity-80 mb-6">Unlock 6 daily topics, 10 chats/day & history, lifetime leaderboard, and streak insurance.</p>
        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        <button disabled={loading} onClick={startCheckout} className="px-5 py-3 rounded-2xl bg-black text-white disabled:opacity-60">
          {loading ? 'Starting…' : 'Upgrade'}
        </button>
        <div className="h-3" />
        <button disabled={portalLoading} onClick={openPortal} className="px-5 py-3 rounded-2xl border border-black/20 disabled:opacity-60">
          {portalLoading ? 'Opening…' : 'Manage billing'}
        </button>
        <div className="mt-6">
          <a href="/daily" className="text-sm underline">Continue without subscribing</a>
        </div>
      </div>
    </main>
  );
}
