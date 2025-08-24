'use client';
import useSWR from 'swr';
import AuthButton from '@/components/AuthButton';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function HeaderRight() {
  const { data } = useSWR<{ profile?: { streak_count?: number } }>(`/api/profile`, fetcher, { suspense: false });
  const streak = data?.profile?.streak_count ?? 0;
  return (
    <div className="flex items-center gap-4">
      <p className="text-sm opacity-70 hidden sm:block">Learn something fun today</p>
      <span className="hidden sm:inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs opacity-80">
        🔥 Streak {streak}
      </span>
      <AuthButton />
    </div>
  );
}
