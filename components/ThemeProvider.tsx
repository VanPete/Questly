// Simple dark mode context and hook
'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: 'light', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    // Initial load from localStorage or system
    const stored = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    let initial: Theme;
    if (stored === 'dark' || stored === 'light') {
      initial = stored;
    } else {
      const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
      initial = prefersDark ? 'dark' : 'light';
    }
    setThemeState(initial);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', initial === 'dark');
      document.documentElement.dataset.theme = initial;
    }
    // Listen for system changes if user hasn't explicitly chosen
    const mql = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const handle = (e: MediaQueryListEvent) => {
      const storedAgain = localStorage.getItem('theme');
      if (!storedAgain) {
        const next = e.matches ? 'dark' : 'light';
        setThemeState(next);
        document.documentElement.classList.toggle('dark', next === 'dark');
        document.documentElement.dataset.theme = next;
      }
    };
    if (mql && mql.addEventListener) mql.addEventListener('change', handle);
    return () => { if (mql && mql.removeEventListener) mql.removeEventListener('change', handle); };
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
      document.documentElement.dataset.theme = t;
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
