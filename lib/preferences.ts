import { useEffect, useState } from 'react';

type Preferences = {
  compactStreak?: boolean;
  theme?: 'light' | 'dark';
};

const STORAGE_KEY = 'questly:preferences';

export function readPreferences(): Preferences {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
  if (!raw) return { compactStreak: true };
  const parsed = JSON.parse(raw) as Preferences;
  return { compactStreak: parsed.compactStreak ?? true, theme: parsed.theme };
  } catch {
  return { compactStreak: true };
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
