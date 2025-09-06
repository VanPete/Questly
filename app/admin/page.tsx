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

function etToday(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

function addDaysISO(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00-05:00'); // ET base (approx; date arithmetic fine)
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchDailyRow(date?: string) {
  const target = date || etToday();
  try {
    const admin = getAdminClient();
    const { data } = await admin
      .from('daily_topics')
      .select('date, free_beginner_id, free_intermediate_id, free_advanced_id, premium_beginner_id, premium_intermediate_id, premium_advanced_id, created_at')
      .eq('date', target)
      .maybeSingle();
    return { date: target, row: data };
  } catch (e) {
    return { date: target, row: null, error: (e as Error).message };
  }
}

async function fetchSchedule(nextDays: number) {
  const base = etToday();
  const dates: string[] = [];
  for (let i = 0; i < nextDays; i++) dates.push(addDaysISO(base, i));
  const admin = getAdminClient();
  const { data } = await admin
    .from('daily_topics')
    .select('date, free_beginner_id, free_intermediate_id, free_advanced_id, premium_beginner_id, premium_intermediate_id, premium_advanced_id')
    .in('date', dates)
    .order('date', { ascending: true });
  const map = new Map((data || []).map(r => [r.date, r] as const));
  return dates.map(d => ({ date: d, row: map.get(d) || null }));
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
  const today = etToday();
  const [dailyApi, todayRow, tomorrowRow, schedule] = await Promise.all([
    fetchDailyApi(),
    fetchDailyRow(today),
    fetchDailyRow(addDaysISO(today, 1)),
    fetchSchedule(7),
  ]);
  const userSync = await fetchUserSync();
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
        <h2 className="font-semibold mb-2">User Sync</h2>
        {userSync ? (
          <div className="text-xs space-y-2">
            <div className="flex flex-wrap gap-4">
              <span>User ID: <span className="font-mono">{userSync.userId}</span></span>
              <span>Profile: {userSync.profile ? 'ok' : 'missing'}</span>
              <span>Points: {userSync.points ? 'ok' : 'missing'}</span>
              <span>Subscription: {userSync.subscription ? (userSync.subscription.plan + (userSync.subscription.status ? ` (${userSync.subscription.status})` : '')) : 'missing'}</span>
              <span>Premium: {userSync.is_premium ? 'yes' : 'no'}</span>
              <span>Progress entries: {userSync.progress_entries}</span>
              <span>Recent chat days: {Array.isArray(userSync.chat_usage?.data) ? userSync.chat_usage.data.length : 0}</span>
            </div>
            <details className="bg-neutral-50 dark:bg-neutral-900 p-2 rounded">
              <summary className="cursor-pointer select-none text-[11px]">Raw</summary>
              <pre className="overflow-auto max-h-64 text-[10px]">{JSON.stringify(userSync, null, 2)}</pre>
            </details>
            <form action={forceResync} className="mt-2 flex items-center gap-3">
              <button className="px-3 py-1 rounded bg-black text-white text-xs" type="submit">Force Re-bootstrap</button>
              <span className="opacity-60">Runs bootstrapCurrentUser()</span>
            </form>
          </div>
        ) : (
          <p className="text-xs">Sign in to inspect user sync.</p>
        )}
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
          <div className="text-sm space-y-3">
            <div className="flex flex-wrap gap-4 items-center">
              <span>API source: <span className="font-mono">{dailyApi.meta.source}</span></span>
              <span>via: {dailyApi.meta.debug?.via}</span>
              {dailyApi.meta.debug?.debugReason && <span className="text-amber-600">{dailyApi.meta.debug.debugReason}</span>}
              <span>ET Date: {dailyApi.meta.debug?.today}</span>
            </div>
            <div className="grid md:grid-cols-6 gap-2">
              {(['Free','Free','Free','Premium','Premium','Premium'] as const).map((tier, idx) => {
                const t = dailyApi.tiles[idx];
                return (
                  <div key={idx} className="border rounded p-2 text-xs min-h-[70px] flex flex-col justify-between bg-white dark:bg-neutral-900">
                    <div className="flex justify-between mb-1"><span className="font-medium">{tier}</span><span>{t?.difficulty || ''}</span></div>
                    <div className="break-all opacity-80">{t ? t.id : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : <div className="text-sm">Could not fetch /api/daily</div>}
        <div className="mt-6 grid md:grid-cols-2 gap-6">
          <div>
            <div className="font-semibold mb-1 text-sm">Raw row (Today)</div>
            {todayRow?.row ? (
              <pre className="text-xs bg-neutral-50 dark:bg-neutral-900 p-3 rounded-lg overflow-auto">{JSON.stringify(todayRow.row, null, 2)}</pre>
            ) : (
              <div className="text-xs">No row for {todayRow?.date} {todayRow?.error && `(error: ${todayRow.error})`}</div>
            )}
          </div>
          <div>
            <div className="font-semibold mb-1 text-sm">Raw row (Tomorrow)</div>
            {tomorrowRow?.row ? (
              <pre className="text-xs bg-neutral-50 dark:bg-neutral-900 p-3 rounded-lg overflow-auto">{JSON.stringify(tomorrowRow.row, null, 2)}</pre>
            ) : (
              <div className="text-xs">No row for {tomorrowRow?.date}</div>
            )}
          </div>
        </div>
        <div className="mt-6">
          <div className="font-semibold mb-2 text-sm">Upcoming Schedule (7 days)</div>
          <div className="overflow-auto">
            <table className="text-xs w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-neutral-100 dark:bg-neutral-800">
                  <th className="text-left p-2">Date (ET)</th>
                  <th className="text-left p-2">Free Beginner</th>
                  <th className="text-left p-2">Free Intermediate</th>
                  <th className="text-left p-2">Free Advanced</th>
                  <th className="text-left p-2">Premium Beginner</th>
                  <th className="text-left p-2">Premium Intermediate</th>
                  <th className="text-left p-2">Premium Advanced</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map(s => (
                  <tr key={s.date} className="border-t">
                    <td className="p-2 font-medium whitespace-nowrap">{s.date}</td>
                    <td className="p-2 break-all">{s.row?.free_beginner_id || '—'}</td>
                    <td className="p-2 break-all">{s.row?.free_intermediate_id || '—'}</td>
                    <td className="p-2 break-all">{s.row?.free_advanced_id || '—'}</td>
                    <td className="p-2 break-all text-amber-700 dark:text-amber-400">{s.row?.premium_beginner_id || '—'}</td>
                    <td className="p-2 break-all text-amber-700 dark:text-amber-400">{s.row?.premium_intermediate_id || '—'}</td>
                    <td className="p-2 break-all text-amber-700 dark:text-amber-400">{s.row?.premium_advanced_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

async function fetchUserSync() {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const r = await fetch(`${base}/api/debug/user-sync?secret=${encodeURIComponent(process.env.ADMIN_PAGE_PASSWORD || '')}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function forceResync() {
  'use server';
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  await fetch(`${base}/api/debug/user-sync?secret=${encodeURIComponent(process.env.ADMIN_PAGE_PASSWORD || '')}`, { method: 'POST', cache: 'no-store' });
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
