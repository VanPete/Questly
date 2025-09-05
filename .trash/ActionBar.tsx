'use client';

export function ActionBar({ onAction }: { onAction: (kind: 'summary') => void }) {
  const btn = 'px-3 py-2 rounded-xl border text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900';
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <button className={btn} onClick={() => onAction('summary')}>Summarize</button>
    </div>
  );
}