"use client";
import React, { Suspense } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { usePreferences } from '@/lib/preferences';
import { SignedOut, SignInButton, useUser } from '@clerk/nextjs';
import { mutate } from 'swr';

function ProfileContent() {
  const hasWindow = typeof window !== 'undefined';
  const qp = useMemo(() => {
    if (!hasWindow) return new URLSearchParams('');
    try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(''); }
  }, [hasWindow]);
  const setup = qp.get('setup') === '1';
  const returnTo = qp.get('returnTo') || '/daily';
  const { user } = useUser();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { preferences, setPreferences } = usePreferences();

  useEffect(() => {
  (async () => {
      try {
  const res = await fetch('/api/profile', { credentials: 'include' });
        const data = await res.json();
        if (data?.profile) {
          setSignedIn(true);
          if (data.profile.display_name) setName(data.profile.display_name);
          if (data.profile.prefs) setPreferences(data.profile.prefs);
        } else {
          setSignedIn(false);
        }
      } catch {
        setSignedIn(false);
      }
    })();
  }, [setPreferences]);

  // Also reflect client auth status to enable Save for signed-in users even if the profile GET returns null
  useEffect(() => {
    if (user) setSignedIn(true);
  }, [user]);

  const [localCount, setLocalCount] = useState(0);
  useEffect(() => setLocalCount(name.length), [name]);

  const save = async () => {
  if (signedIn === false) {
      setMsg('auth required');
      return;
    }
    // validation
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed) {
      setMsg('Display name is required');
      return;
    }

    // optimistic update
    const prior = name;
    setName(trimmed);
    setMsg('Saving…');
    setLoading(true);
    try {
  type Payload = { display_name: string; prefs?: Record<string, unknown> };
  const payload: Payload = { display_name: trimmed };
  if (preferences) payload.prefs = preferences as Record<string, unknown>;
  const res = await fetch('/api/profile', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
  if (res.status === 401) {
          setMsg('auth required');
          setSignedIn(false);
        } else {
          setMsg(data.error || 'save_failed');
        }
        setName(prior); // rollback
        return;
      }
  setMsg('Saved');
  // Optimistically update header/profile cache so display_name shows immediately
  type ProfileResp = { profile?: { display_name?: string } } | undefined;
  mutate<ProfileResp>('/api/profile', (curr: ProfileResp) => {
    const next: ProfileResp = curr && typeof curr === 'object' ? { ...curr } : {};
    next!.profile = { ...(next?.profile || {}), display_name: trimmed };
    return next;
  }, false);
  // Also revalidate in background
  mutate('/api/profile');
    } catch (e: unknown) {
      setMsg((e as Error).message || 'save_failed');
      setName(prior); // rollback
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">{setup ? 'Create your profile' : 'Profile'}</h1>
      <label className="block text-sm mb-1">Display name</label>
      <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-3 py-2 mb-3" maxLength={40} placeholder="Your name" />
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm opacity-70">{localCount}/40</div>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={loading || signedIn === false} className="px-4 py-2 rounded bg-black text-white disabled:opacity-60">{loading ? 'Saving…' : 'Save'}</button>
        </div>
        <SignedOut>
          <div className="text-sm">
            <div className="mb-2">Sign in to save changes</div>
            <SignInButton mode="modal">
              <span role="link" tabIndex={0} className="cursor-pointer text-sm underline underline-offset-4 hover:opacity-90">Sign in</span>
            </SignInButton>
          </div>
        </SignedOut>
      </div>
      {msg && <div className="mt-3 text-sm opacity-80">{msg}</div>}

      {/* Preferences (moved here from Settings) */}
      <div className="mt-6 border-t pt-4 space-y-4">
        <h2 className="text-lg font-semibold">Preferences</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Compact streak</div>
            <div className="text-sm opacity-80">Show a small numeric streak pill in the header.</div>
          </div>
          <label className="flex items-center gap-2">
            <span className="sr-only">Compact streak</span>
            <input
              aria-label="Compact streak"
              type="checkbox"
              checked={preferences?.compactStreak ?? true}
              onChange={e => setPreferences({ ...(preferences || {}), compactStreak: e.target.checked })}
            />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Show less-used items</div>
            <div className="text-sm opacity-80">Condense less-used actions into the menu when enabled.</div>
          </div>
          <label className="flex items-center gap-2">
            <span className="sr-only">Show less-used items</span>
            <input
              aria-label="Show less-used items"
              type="checkbox"
              checked={preferences?.showLessUsed ?? false}
              onChange={e => setPreferences({ ...(preferences || {}), showLessUsed: e.target.checked })}
            />
          </label>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <a href={returnTo} className="px-4 py-2 rounded border hover:bg-neutral-50">Return to Quests</a>
        {setup && (
          <a href={returnTo} className="text-sm underline opacity-80">Skip for now</a>
        )}
      </div>
    </main>
  );
}

export default function ProfilePage() {
  // In unit tests without Next app router, bail out with a minimal shell
  const hasRouter = typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>)['__NEXT_ROUTER'];
  if (!hasRouter && typeof window === 'undefined') {
    return (
      <main className="max-w-md mx-auto p-4">
        <h1 className="text-2xl font-semibold mb-4">Profile</h1>
      </main>
    );
  }
  return (
    <Suspense fallback={<div className="max-w-md mx-auto p-4"><h1 className="text-2xl font-semibold mb-2">Profile</h1><div className="text-sm opacity-70">Loading…</div></div>}>
      <ProfileContent />
    </Suspense>
  );
}
