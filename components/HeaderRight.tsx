'use client';
import { useState, useRef, useEffect } from 'react';
import useSWR from 'swr';
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
  const { data } = useSWR<{ profile?: { streak_count?: number; display_name?: string; avatar_url?: string; email?: string } }>(`/api/profile`, fetcher, { suspense: false, revalidateOnFocus: false, revalidateOnReconnect: false });
  const profile = data?.profile;
  const streak = profile?.streak_count ?? 0;
  const { preferences } = usePreferences();
  const { theme, setTheme } = useTheme();

  const [openSettings, setOpenSettings] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (settingsButtonRef.current) settingsButtonRef.current.setAttribute('aria-expanded', String(openSettings));
    if (profileButtonRef.current) profileButtonRef.current.setAttribute('aria-expanded', String(openProfile));
  }, [openSettings, openProfile]);

  useEffect(() => {
    if (toggleRef.current) toggleRef.current.setAttribute('aria-pressed', String(theme === 'dark'));
  }, [theme]);

  // close menus on outside click or Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (settingsRef.current && !settingsRef.current.contains(target) && settingsButtonRef.current && !settingsButtonRef.current.contains(target)) {
        setOpenSettings(false);
      }
      if (profileRef.current && !profileRef.current.contains(target) && profileButtonRef.current && !profileButtonRef.current.contains(target)) {
        setOpenProfile(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenSettings(false);
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
              <Link href="/profile" className="block text-sm underline">View profile</Link>
              <Link href="/settings" className="block text-sm underline">Settings</Link>
              <div>
                <AuthButton />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Persistent Settings button */}
      <div className="relative">
        <button
          ref={settingsButtonRef}
          aria-haspopup="true"
          aria-label="Open settings"
          className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={() => setOpenSettings(v => !v)}
          title="Settings"
        >
          {/* gear icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09c.7 0 1.28-.4 1.51-1a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 0 1 6.18 3.7l.06.06c.5.5 1.17.77 1.82.33.6-.36 1.29-.36 1.9 0 .5.3 1.1.5 1.77.5h.16c.67 0 1.27-.2 1.77-.5.61-.36 1.3-.36 1.9 0 .65.44 1.32.17 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06c-.6.6-.6 1.66 0 2.26.36.6.36 1.29 0 1.9-.3.5-.5 1.1-.5 1.77v.16c0 .67.2 1.27.5 1.77.36.61.36 1.3 0 1.9z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {openSettings && (
          <div ref={settingsRef} className="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-900 border rounded shadow-md p-3 z-20">
            <div className="flex items-center justify-between px-2 py-1">
              <div className="text-sm">Theme</div>
              <button
                className="w-10 h-6 rounded-full bg-neutral-200 dark:bg-neutral-700 relative"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
                ref={toggleRef}
              >
                <span className={`block w-4 h-4 bg-white dark:bg-black rounded-full absolute top-1/2 transform -translate-y-1/2 transition ${theme === 'dark' ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
            <div className="mt-3 text-sm opacity-80">Streak: {streak}</div>
            <div className="mt-3 border-t pt-3 space-y-2">
              <Link href="/daily" className="block text-sm">{"Today's Quests"}</Link>
              <Link href="/plans" className="block text-sm">My Plans</Link>
              <Link href="/settings" className="block text-sm">Full settings</Link>
            </div>
            <div className="mt-3 pt-2 border-t">
              <AuthButton />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
