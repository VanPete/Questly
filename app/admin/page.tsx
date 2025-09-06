import Link from 'next/link';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getAdminClient } from '@/lib/supabaseAdmin';

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

interface DailyDebugResponse { tiles: Array<{ id: string; title: string; difficulty: string }>; meta: { source: string; debug?: { today: string; debugReason?: string; via: string; isPremium?: boolean | null } } }

async function fetchDailyApi(): Promise<DailyDebugResponse | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  try {
    const r = await fetch(`${base}/api/daily?debug=1`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function fetchDailyRow() {
  try {
    const admin = getAdminClient();
    // Use ET date like the API
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
    const today = fmt.format(now);
    const { data } = await admin
      .from('daily_topics')
      .select('date, free_beginner_id, free_intermediate_id, free_advanced_id, premium_beginner_id, premium_intermediate_id, premium_advanced_id, created_at')
      .eq('date', today)
      .maybeSingle();
    return { today, row: data };
  } catch (e) {
    return { today: 'n/a', row: null, error: (e as Error).message };
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
  const [dailyApi, dailyRow] = await Promise.all([fetchDailyApi(), fetchDailyRow()]);
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
      <section className="rounded-xl border p-4 mb-6">
        <h2 className="font-semibold mb-2">Daily Cron (manual)</h2>
        <form action={triggerCron} className="flex items-center gap-3 mb-3">
          <button type="submit" className="px-3 py-2 rounded bg-black text-white text-sm">Run daily-cron (skip rotate if scheduled)</button>
        </form>
        <form action={triggerCronReplace} className="flex items-center gap-3">
          <button type="submit" className="px-3 py-2 rounded bg-rose-600 text-white text-sm">Run daily-cron with replace=1</button>
          <span className="text-xs opacity-70">Forces rotate even if schedule row exists</span>
        </form>
        <p className="mt-3 text-xs opacity-60">Calls /api/admin/daily-cron internally.</p>
      </section>
      <section className="rounded-xl border p-4 mb-6">
        <h2 className="font-semibold mb-2">Daily Quests (debug)</h2>
        {dailyApi ? (
          <div className="text-sm space-y-2">
            <div>API source: <span className="font-mono">{dailyApi.meta.source}</span> (via {dailyApi.meta.debug?.via}){dailyApi.meta.debug?.debugReason && <span> – {dailyApi.meta.debug.debugReason}</span>}</div>
            <div>ET Date: {dailyApi.meta.debug?.today}</div>
            <ul className="grid md:grid-cols-3 gap-2">
              {dailyApi.tiles.map(t => (
                <li key={t.id} className="border rounded p-2">
                  <div className="font-medium text-xs mb-1">{t.difficulty}</div>
                  <div className="text-xs break-all">{t.id}</div>
                </li>
              ))}
            </ul>
          </div>
        ) : <div className="text-sm">Could not fetch /api/daily</div>}
        <div className="mt-4">
          <div className="font-semibold mb-1 text-sm">Raw daily_topics row</div>
          {dailyRow?.row ? (
            <pre className="text-xs bg-neutral-50 dark:bg-neutral-900 p-3 rounded-lg overflow-auto">{JSON.stringify(dailyRow.row, null, 2)}</pre>
          ) : (
            <div className="text-xs">No row for {dailyRow?.today} {dailyRow?.error && `(error: ${dailyRow.error})`}</div>
          )}
        </div>
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

async function triggerCron() {
  'use server';
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  await fetch(`${base}/api/admin/daily-cron`, { cache: 'no-store', headers: { 'x-cron-secret': process.env.CRON_SECRET || '' } });
}

async function triggerCronReplace() {
  'use server';
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  await fetch(`${base}/api/admin/daily-cron?replace=1`, { cache: 'no-store', headers: { 'x-cron-secret': process.env.CRON_SECRET || '' } });
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
