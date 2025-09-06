'use client';
import { useEffect, useCallback, useState } from 'react';
import useSWR from 'swr';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/nextjs';
import { usePreferences } from '../lib/preferences';

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include' });
  return res.json();
};

export default function HeaderRight() {
  const { data } = useSWR<{ profile?: { streak_count?: number } }>(`/api/profile`, fetcher, { suspense: false, revalidateOnFocus: true, revalidateOnReconnect: true });
  const profile = data?.profile;
  const { data: sub } = useSWR<{ plan: 'free'|'premium' }>(`/api/subscription`, fetcher);
  const [portalLoading, setPortalLoading] = useState(false);
  const streak = profile?.streak_count ?? 0;
  const { preferences } = usePreferences();
  const { user } = useUser();
  useEffect(() => { /* Clerk state triggers rerenders automatically */ }, [user?.id]);

  const openPortal = useCallback(async () => {
    try {
      setPortalLoading(true);
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      if (!res.ok) throw new Error('portal');
      const js = await res.json();
      if (js?.url) {
        window.location.href = js.url;
        return;
      }
      window.location.href = '/upgrade';
    } catch {
      window.location.href = '/upgrade';
    } finally {
      setPortalLoading(false);
    }
  }, []);

  return (
    <div className="flex items-center gap-3">
      {/* Optional compact streak pill */}
      {typeof streak === 'number' && streak > 0 && preferences?.compactStreak !== false && (
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300" aria-label={`Streak ${streak}`}> {streak} </span>
      )}
      {/* Manage subscription button when premium */}
      {sub?.plan === 'premium' && (
        <button
          type="button"
          onClick={openPortal}
          disabled={portalLoading}
          className="px-3 py-1.5 rounded-md border text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 focus-visible:outline-2 focus-visible:ring-amber-300 disabled:opacity-60"
        >
          {portalLoading ? '...' : 'Manage'}
        </button>
      )}
      <SignedOut>
        <SignInButton mode="modal">
          <span
            className="px-3 py-1.5 rounded-md border text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 focus-visible:outline-2 focus-visible:ring-amber-300 cursor-pointer"
            aria-label="Sign in"
            role="button"
            tabIndex={0}
          >
            Sign in
          </span>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </div>
  );
}
