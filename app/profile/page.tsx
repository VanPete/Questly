"use client";
import { useEffect, useState } from 'react';
import AuthButton from '@/components/AuthButton';

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/profile');
        const data = await res.json();
        if (data?.profile) {
          setSignedIn(true);
          if (data.profile.display_name) setName(data.profile.display_name);
        } else {
          setSignedIn(false);
        }
      } catch {
        setSignedIn(false);
      }
    })();
  }, []);

  const save = async () => {
    if (signedIn === false) {
      setMsg('auth required');
      return;
    }
    setLoading(true); setMsg(null);
    try {
      const res = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: name }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setMsg('auth required');
          setSignedIn(false);
        } else {
          setMsg(data.error || 'save_failed');
        }
        return;
      }
      setMsg('Saved');
    } catch (e: unknown) {
      setMsg((e as Error).message || 'save_failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Profile</h1>
      <label className="block text-sm mb-1">Display name</label>
      <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-3 py-2 mb-3" maxLength={40} placeholder="Your name" />
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={loading || signedIn === false} className="px-4 py-2 rounded bg-black text-white disabled:opacity-60">{loading ? 'Saving…' : 'Save'}</button>
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
