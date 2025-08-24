"use client";
import { useEffect, useState } from 'react';

export default function ProfilePage() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/profile');
      const data = await res.json();
      if (data?.profile?.display_name) setName(data.profile.display_name);
    })();
  }, []);

  const save = async () => {
    setLoading(true); setMsg(null);
    try {
      const res = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: name }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'save_failed');
      setMsg('Saved');
    } catch (e: unknown) {
      setMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Profile</h1>
      <label className="block text-sm mb-1">Display name</label>
      <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-3 py-2 mb-3" maxLength={40} placeholder="Your name" />
      <button onClick={save} disabled={loading} className="px-4 py-2 rounded bg-black text-white disabled:opacity-60">{loading ? 'Saving…' : 'Save'}</button>
      {msg && <div className="mt-3 text-sm opacity-80">{msg}</div>}
    </main>
  );
}
