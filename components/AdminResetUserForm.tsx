"use client";
import { useActionState } from 'react';

interface ActionResult {
  ok?: boolean;
  error?: string;
  summary?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function AdminResetUserForm({ action }: { action: (prevState: ActionResult | undefined, formData: FormData) => Promise<ActionResult> }) {
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(action, undefined);
  return (
    <div className="space-y-3">
      <form action={formAction} className="grid gap-3 max-w-md text-sm">
        <label className="flex flex-col gap-1">User email
          <input name="email" type="email" required placeholder="user@example.com" className="border rounded px-2 py-1" />
        </label>
        <fieldset className="border rounded p-2 flex flex-col gap-2">
          <legend className="text-xs font-medium px-1">Scopes</legend>
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" name="all" defaultChecked /> <span>All history</span></label>
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" name="resetPoints" defaultChecked /> <span>Reset points</span></label>
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" name="resetStreak" defaultChecked /> <span>Reset streak</span></label>
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" name="resetChat" defaultChecked /> <span>Clear chat usage</span></label>
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" name="resetLeaderboard" defaultChecked /> <span>Clear leaderboard rows</span></label>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button className="px-4 py-2 rounded bg-rose-600 text-white text-sm" type="submit">Reset Selected</button>
          <button type="button" onClick={(e) => {
            const form = (e.currentTarget as HTMLButtonElement).closest('form');
            if (!form) return;
            (['all','resetPoints','resetStreak','resetChat','resetLeaderboard'] as const).forEach(n => {
              const el = form.querySelector<HTMLInputElement>(`input[name="${n}"]`); if (el) el.checked = true;
            });
            form.requestSubmit();
          }} className="px-4 py-2 rounded bg-indigo-600 text-white text-sm">Reset Everything For User</button>
        </div>
      </form>
      {state?.error && <div className="text-xs text-rose-600" role="alert">{state.error}</div>}
      {state?.ok && (
        <details open className="text-xs bg-neutral-50 dark:bg-neutral-900 border rounded p-3 max-w-xl">
          <summary className="cursor-pointer select-none mb-2 font-medium">Result</summary>
          <pre className="overflow-auto max-h-64 text-[10px] leading-snug">{JSON.stringify(state.summary, null, 2)}</pre>
        </details>
      )}
      <p className="text-[11px] opacity-60 max-w-md leading-snug">This calls /api/admin/reset-user using the server secret so it works in production without exposing keys. Use carefully. If both All and Date provided, All wins.</p>
    </div>
  );
}
