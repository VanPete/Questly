"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { usePreferences } from '@/lib/preferences';
import useSWR from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' });
  return res.json();
};

export default function SettingsPage() {
  const { preferences, setPreferences } = usePreferences();
  const [local, setLocal] = useState({ compactStreak: true, showLessUsed: false });

  useEffect(() => {
    if (preferences) setLocal({ compactStreak: preferences.compactStreak ?? true, showLessUsed: preferences.showLessUsed ?? false });
  }, [preferences]);

  const save = () => setPreferences({ compactStreak: local.compactStreak, showLessUsed: local.showLessUsed });

  const { data: sub } = useSWR<{ plan: 'free'|'premium' }>(`/api/subscription`, fetcher);
  const [billingLoading, setBillingLoading] = useState(false);
  const openPortal = useCallback(async () => {
    if (billingLoading) return;
    try {
      setBillingLoading(true);
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const js = await res.json().catch(()=>({}));
      if (res.ok && js?.url) {
        window.location.href = js.url;
      } else {
        window.location.href = '/upgrade';
      }
    } catch {
      window.location.href = '/upgrade';
    } finally {
      setBillingLoading(false);
    }
  }, [billingLoading]);

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Settings</h1>
        <p className="text-sm opacity-75">Customize your experience and manage your subscription.</p>
      </div>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Compact streak</div>
            <div className="text-sm opacity-80">Show a small numeric streak pill in the header.</div>
          </div>
          <label className="flex items-center gap-2">
            <span className="sr-only">Compact streak</span>
            <input aria-label="Compact streak" type="checkbox" checked={local.compactStreak} onChange={e => setLocal(s => ({ ...s, compactStreak: e.target.checked }))} />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Show less-used items</div>
            <div className="text-sm opacity-80">Condense less-used actions into the settings menu when enabled.</div>
          </div>
          <label className="flex items-center gap-2">
            <span className="sr-only">Show less-used items</span>
            <input aria-label="Show less-used items" type="checkbox" checked={local.showLessUsed} onChange={e => setLocal(s => ({ ...s, showLessUsed: e.target.checked }))} />
          </label>
        </div>

        <div className="pt-2">
          <button className="px-4 py-2 rounded bg-black text-white" onClick={save}>Save preferences</button>
        </div>

        {/* Billing / Subscription management */}
        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-2">Subscription & Billing</h2>
          <p className="text-sm opacity-75 mb-3">{sub?.plan === 'premium' ? 'You have an active premium subscription.' : 'You are on the free plan.'}</p>
          <div className="flex gap-3 flex-wrap">
            {sub?.plan === 'premium' ? (
              <button
                onClick={openPortal}
                disabled={billingLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border text-sm font-medium bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-60"
              >{billingLoading ? 'Opening…' : 'Manage Billing'}</button>
            ) : (
              <a
                href="/upgrade"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition"
              >Upgrade to Premium</a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
