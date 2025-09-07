"use client";
import { useEffect } from 'react';
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
  const streak = profile?.streak_count ?? 0;
  const { preferences } = usePreferences();
  const { user } = useUser();
  useEffect(() => { /* Clerk state triggers rerenders automatically */ }, [user?.id]);

  return (
    <div className="flex items-center gap-3">
      {/* Optional compact streak pill */}
      {typeof streak === 'number' && streak > 0 && preferences?.compactStreak !== false && (
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300" aria-label={`Streak ${streak}`}> {streak} </span>
      )}
      {/* Settings button (always visible) */}
      <a
        href="/settings"
        className="questly-pill-btn"
        aria-label="Settings"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09c0 .69.4 1.31 1 1.51.61.21 1.28.05 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.38.54-.54 1.21-.33 1.82.21.61.83 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.69 0-1.31.4-1.51 1Z" />
        </svg>
        <span>Settings</span>
      </a>
      <SignedOut>
        <SignInButton mode="modal">
          <span
            className="questly-pill-btn cursor-pointer"
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
