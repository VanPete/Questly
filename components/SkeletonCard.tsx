'use client';

export default function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white/70 dark:bg-neutral-900/50 animate-pulse">
      <div className="flex items-center justify-between mb-2">
        <span className="h-5 w-20 rounded-full bg-neutral-200 dark:bg-neutral-800" />
        <span className="h-5 w-20 rounded-full bg-neutral-200 dark:bg-neutral-800" />
      </div>
      <div className="h-5 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800 mb-2" />
      <div className="h-4 w-full rounded bg-neutral-200 dark:bg-neutral-800 mb-1" />
      <div className="h-4 w-5/6 rounded bg-neutral-200 dark:bg-neutral-800 mb-3" />
      <div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}
