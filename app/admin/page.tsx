import Link from 'next/link';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function hash(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 32);
}

interface HealthResult { ok: boolean; dbOk: boolean; urlConfigured: boolean; anonConfigured: boolean; durationMs: number; error: string | null }

async function fetchHealth(): Promise<HealthResult | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  try {
    const r = await fetch(`${base}/api/health`, { cache: 'no-store' });
    return await r.json();
  } catch {
    return null;
  }
}

export default async function AdminIndex() {
  const expected = process.env.ADMIN_PAGE_PASSWORD || '';
  const c = await cookies();
  const token = c.get('admin_auth')?.value;
  const valid = expected && token === hash(expected);
  if (!valid) {
    return <PasswordGate expected={!!expected} />;
  }
  const health = await fetchHealth();
  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold mb-4">Admin</h1>
        <form action={logout} className="mb-4">
          <button className="text-sm underline" type="submit">Logout</button>
        </form>
      </div>
      <ul className="list-disc ml-6 space-y-2 mb-8">
        <li><Link className="underline" href="/admin/daily">Daily rotation</Link></li>
        <li><Link className="underline" href="/admin/daily#schedule-gen">Generate daily schedule</Link></li>
        <li><Link className="underline" href="/admin/daily#reset-tools">Reset attempts</Link></li>
      </ul>
      <section className="rounded-xl border p-4 mb-6">
        <h2 className="font-semibold mb-2">Supabase Health</h2>
        {health ? (
          <ul className="text-sm space-y-1">
            <li>Status: <span className={health.ok ? 'text-emerald-600' : 'text-rose-600'}>{health.ok ? 'OK' : 'FAIL'}</span></li>
            <li>DB Query: {health.dbOk ? 'ok' : 'fail'}</li>
            <li>URL Env: {health.urlConfigured ? 'present' : 'missing'}</li>
            <li>Anon Key Env: {health.anonConfigured ? 'present' : 'missing'}</li>
            <li>Latency: {health.durationMs} ms</li>
            {health.error && <li className="text-rose-600">Error: {health.error}</li>}
          </ul>
        ) : (
          <p className="text-sm">Could not fetch /api/health</p>
        )}
        <p className="mt-3 text-xs opacity-70">Endpoint: /api/health</p>
      </section>
      <p className="text-xs opacity-60">Temp password layer. Remove when role-based auth is in place.</p>
    </main>
  );
}

async function logout() {
  'use server';
  const c = await cookies();
  c.set({ name: 'admin_auth', value: '', path: '/', maxAge: 0 });
}

async function login(formData: FormData) {
  'use server';
  const expected = process.env.ADMIN_PAGE_PASSWORD || '';
  const provided = String(formData.get('password') || '');
  const c = await cookies();
  if (expected && provided && provided === expected) {
    c.set({ name: 'admin_auth', value: hash(expected), httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 });
  }
}

function PasswordGate({ expected }: { expected: boolean }) {
  return (
    <main className="p-6 max-w-sm mx-auto">
      <h1 className="text-xl font-bold mb-4">Admin Access</h1>
      {!expected && (
        <p className="text-sm mb-4 text-rose-600">ADMIN_PAGE_PASSWORD not set.</p>
      )}
      <form action={login} className="space-y-3">
        <label className="block text-sm font-medium">Password
          <input name="password" type="password" className="mt-1 w-full border rounded px-3 py-2" autoFocus />
        </label>
        <button className="px-4 py-2 rounded bg-black text-white w-full" type="submit">Enter</button>
      </form>
    </main>
  );
}
