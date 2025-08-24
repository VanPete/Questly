import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { ReactNode } from 'react';

export const metadata = {
  title: 'Questly',
  description: 'Daily quests for your curiosity.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <header className="flex items-center justify-between mb-6">
            <h1 className="font-black tracking-tight text-3xl">Questly</h1>
            <p className="text-sm opacity-70">Learn something fun today</p>
          </header>
          {children}
        </div>
              <Analytics />
      </body>
    </html>
  );
}
