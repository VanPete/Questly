"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { usePreferences } from '@/lib/preferences';
import { useTheme } from '@/components/ThemeProvider';
import useSWR from 'swr';

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' });
  return res.json();
};

export default function SettingsPage() {
  const { preferences, setPreferences } = usePreferences();
  const { theme, setTheme } = useTheme();
  const [local, setLocal] = useState({ compactStreak: true, theme: 'light' as 'light' | 'dark' });

  useEffect(() => {
    if (preferences) setLocal({ compactStreak: preferences.compactStreak ?? true, theme: preferences.theme ?? (theme || 'light') });
  }, [preferences, theme]);

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const save = () => {
    setPreferences({ compactStreak: local.compactStreak, theme: local.theme });
    setTheme(local.theme);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 1800);
  };

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
        <SettingToggle
          label="Compact streak"
          description="Show a small numeric streak pill in the header."
          checked={local.compactStreak}
          onChange={val => setLocal(s => ({ ...s, compactStreak: val }))}
        />

        <SettingToggle
          label="Dark mode"
          description="Switch between light and dark themes."
          checked={local.theme === 'dark'}
          onChange={val => setLocal(s => ({ ...s, theme: val ? 'dark' : 'light' }))}
        />

        <div className="pt-2 flex items-center gap-3">
          <button
            className="px-4 py-2 rounded bg-black text-white font-medium hover:bg-neutral-800 active:scale-[.97] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            onClick={save}
          >{savedAt ? 'Saved!' : 'Save preferences'}</button>
          {savedAt && <span className="text-sm text-emerald-600 dark:text-emerald-400">Preferences updated</span>}
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

function SettingToggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2 gap-6">
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-sm opacity-80">{description}</div>
      </div>
      <label className="relative inline-block h-8 w-16 select-none">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          aria-label={label}
        />
        <span className={`block h-full w-full rounded-full border transition-colors shadow-inner ${checked ? 'bg-amber-500/90 border-amber-600' : 'bg-neutral-200/70 dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600'} peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-amber-400`} />
        <span className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-8' : ''}`} />
      </label>
    </div>
  );
}
