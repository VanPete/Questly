import React, { useEffect, useState } from 'react';
import { usePreferences } from '@/lib/preferences';

export default function SettingsPage() {
  const { preferences, setPreferences } = usePreferences();
  const [local, setLocal] = useState({ compactStreak: true, showLessUsed: false });

  useEffect(() => {
    if (preferences) setLocal({ compactStreak: preferences.compactStreak ?? true, showLessUsed: preferences.showLessUsed ?? false });
  }, [preferences]);

  const save = () => setPreferences({ compactStreak: local.compactStreak, showLessUsed: local.showLessUsed });

  return (
    <div className="max-w-2xl mx-auto py-6">
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Compact streak</div>
            <div className="text-sm opacity-80">Show a small numeric streak pill in the header.</div>
          </div>
          <label className="flex items-center gap-2">
            <span className="sr-only">Compact streak</span>
            <input aria-label="Compact streak" type="checkbox" checked={local.compactStreak} onChange={e => setLocal(s => ({ ...s, compactStreak: e.target.checked }))} />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Show less-used items</div>
            <div className="text-sm opacity-80">Condense less-used actions into the settings menu when enabled.</div>
          </div>
          <label className="flex items-center gap-2">
            <span className="sr-only">Show less-used items</span>
            <input aria-label="Show less-used items" type="checkbox" checked={local.showLessUsed} onChange={e => setLocal(s => ({ ...s, showLessUsed: e.target.checked }))} />
          </label>
        </div>

        <div>
          <button className="px-4 py-2 rounded bg-black text-white" onClick={save}>Save preferences</button>
        </div>
      </div>
    </div>
  );
}
