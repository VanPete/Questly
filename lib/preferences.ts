import { useEffect, useState } from 'react';

type Preferences = {
  compactStreak?: boolean;
  showLessUsed?: boolean;
};

const STORAGE_KEY = 'questly:preferences';

export function readPreferences(): Preferences {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return { compactStreak: true, showLessUsed: false };
    return JSON.parse(raw) as Preferences;
  } catch {
    return { compactStreak: true, showLessUsed: false };
  }
}

export function writePreferences(prefs: Preferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  useEffect(() => {
    const p = readPreferences();
    setPreferences(p);
  }, []);

  useEffect(() => {
    if (preferences) writePreferences(preferences);
  }, [preferences]);

  return { preferences, setPreferences } as { preferences: Preferences | null; setPreferences: (p: Preferences) => void };
}
