'use client';
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
      <SignedOut>
        <SignInButton />
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </div>
  );
}
