'use client';
import useSWR from 'swr';
import AuthButton from '@/components/AuthButton';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function HeaderRight() {
  const { data } = useSWR<{ profile?: { streak_count?: number } }>(`/api/profile`, fetcher, { suspense: false });
  const streak = data?.profile?.streak_count ?? 0;
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-4">
      <button
        aria-label="Toggle dark mode"
        className="rounded-full border px-2 py-1 text-xs bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? '🌙' : '☀️'}
      </button>
      <p className="text-sm opacity-70 hidden sm:block">Learn something fun today</p>
      <span className="hidden sm:inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs opacity-80" title="Complete at least 1 Quest today to keep your streak alive!">
        🔥 Streak {streak}
      </span>
      <Link href="/profile" className="text-sm underline hidden sm:block">Profile</Link>
      <AuthButton />
    </div>
  );
}
