import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { ReactNode } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import HeaderRight from '@/components/HeaderRight';
import Link from 'next/link';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata = {
  title: 'Questly',
  description: 'Daily quests for your curiosity.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white via-neutral-50 to-neutral-100 dark:from-neutral-900 dark:via-neutral-950 dark:to-black">
        <ThemeProvider>
          <div className="mx-auto max-w-5xl px-4 py-6">
            <header className="flex items-center justify-between mb-6">
              <Link href="/login" className="flex items-center gap-3 group" title="Back to login">
                <div className="w-8 h-8 grid grid-cols-2 grid-rows-2 gap-0.5">
                  <div className="bg-black/90 dark:bg-white/90 rounded-sm" />
                  <div className="bg-yellow-400 rounded-sm" />
                  <div className="bg-emerald-500 rounded-sm" />
                  <div className="bg-rose-500 rounded-sm" />
                </div>
                <h1 className="font-black tracking-tight text-3xl group-hover:underline">Questly</h1>
              </Link>
              <HeaderRight />
            </header>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
