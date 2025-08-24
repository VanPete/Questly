"use client";
import { useState } from 'react';

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startCheckout = async () => {
    setLoading(true); setError(null);
    try {
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
  return (
    <main className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">Go Premium</h1>
        <p className="opacity-80 mb-6">Unlock 6 daily topics, unlimited chat & history, lifetime leaderboard, and streak insurance.</p>
        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        <button disabled={loading} onClick={startCheckout} className="px-5 py-3 rounded-2xl bg-black text-white disabled:opacity-60">
          {loading ? 'Starting…' : 'Upgrade'}
        </button>
      </div>
    </main>
  );
}
