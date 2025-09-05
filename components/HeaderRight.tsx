'use client';
import { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { supabase } from '@/lib/supabaseClient';
import { getAccessToken } from '@/lib/user';
import AuthButton from '@/components/AuthButton';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';
import { usePreferences } from '../lib/preferences';

const fetcher = async (url: string) => {
  const token = await getAccessToken().catch(() => null);
  const init: RequestInit = {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  };
  const res = await fetch(url, init);
  return res.json();
};

export default function HeaderRight() {
  const { data, mutate } = useSWR<{ profile?: { streak_count?: number; display_name?: string; avatar_url?: string; email?: string } }>(`/api/profile`, fetcher, { suspense: false, revalidateOnFocus: true, revalidateOnReconnect: true });
  const profile = data?.profile;
  const streak = profile?.streak_count ?? 0;
  const { preferences } = usePreferences();
  const { theme } = useTheme();

  const [openProfile, setOpenProfile] = useState(false);
  // Settings dropdown removed; keep only profile dropdown
  const profileRef = useRef<HTMLDivElement | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (profileButtonRef.current) profileButtonRef.current.setAttribute('aria-expanded', String(openProfile));
  }, [openProfile]);

  // Revalidate profile on auth state changes
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      mutate();
    });
    return () => sub.subscription.unsubscribe();
  }, [mutate]);

  useEffect(() => {
    if (toggleRef.current) toggleRef.current.setAttribute('aria-pressed', String(theme === 'dark'));
  }, [theme]);

  // close menus on outside click or Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (profileRef.current && !profileRef.current.contains(target) && profileButtonRef.current && !profileButtonRef.current.contains(target)) {
        setOpenProfile(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenProfile(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const initials = (name?: string) => {
    if (!name) return '';
    return name.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
  };

  return (
    <div className="flex items-center gap-3">
  {/* Profile: compact avatar + display name button -> profile menu */}
      <div className="relative">
        <button
          ref={profileButtonRef}
          aria-haspopup="true"
          aria-label={profile?.display_name ? `Open profile menu for ${profile.display_name}` : 'Open profile menu'}
          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={() => setOpenProfile(v => !v)}
          title="Profile"
        >
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <span className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-semibold">{initials(profile?.display_name || profile?.email || 'U')}</span>
          )}
          <span className="text-sm leading-none hidden sm:inline">{profile?.display_name ?? profile?.email ?? 'Guest'}</span>
          {/* Compact streak pill (no emoji) */}
          {typeof streak === 'number' && streak > 0 && preferences?.compactStreak !== false && (
            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300" aria-label={`Streak ${streak}`}> {streak} </span>
          )}
        </button>

        {openProfile && (
          <div ref={profileRef} className="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-900 border rounded shadow-md p-3 z-20">
            <div className="flex items-center gap-3 mb-2">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-sm font-semibold">{initials(profile?.display_name || profile?.email || 'U')}</div>
              )}
              <div>
                <div className="font-medium">{profile?.display_name ?? 'Guest'}</div>
                {profile?.email && <div className="text-xs opacity-80">{profile.email}</div>}
              </div>
            </div>
            <div className="space-y-2">
              {profile ? (
                <>
                  <Link href="/profile" className="block text-sm underline hover:opacity-90" onClick={() => setOpenProfile(false)}>View profile</Link>
                  <Link href="/settings" className="block text-sm underline hover:opacity-90" onClick={() => setOpenProfile(false)}>Settings</Link>
                  <div>
                    <AuthButton />
                  </div>
                </>
              ) : (
                <>
                  <Link href="/login" className="block text-sm underline hover:opacity-90" onClick={() => setOpenProfile(false)}>Login</Link>
                  <div>
                    <AuthButton />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

  {/* Settings moved into profile dropdown */}
    </div>
  );
}
