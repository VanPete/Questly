"use client";
import React from 'react';
import { useEffect, useState } from 'react';
import AuthButton from '@/components/AuthButton';
import { usePreferences } from '@/lib/preferences';
import { getAccessToken, useSupabaseUser } from '@/lib/user';
import { mutate } from 'swr';

export default function ProfilePage() {
  const user = useSupabaseUser();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { preferences, setPreferences } = usePreferences();

  useEffect(() => {
  (async () => {
      try {
    const token = await getAccessToken().catch(() => null);
    const res = await fetch('/api/profile', token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
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
  const token = await getAccessToken().catch(() => null);
  const res = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) });
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
      <h1 className="text-2xl font-semibold mb-4">Profile</h1>
      <label className="block text-sm mb-1">Display name</label>
      <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-3 py-2 mb-3" maxLength={40} placeholder="Your name" />
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm opacity-70">{localCount}/40</div>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={loading || signedIn === false} className="px-4 py-2 rounded bg-black text-white disabled:opacity-60">{loading ? 'Saving…' : 'Save'}</button>
        </div>
        {signedIn === false && (
          <div className="text-sm">
            <div className="mb-2">Sign in to save changes</div>
            <AuthButton />
          </div>
        )}
      </div>
      {msg && <div className="mt-3 text-sm opacity-80">{msg}</div>}
    </main>
  );
}
