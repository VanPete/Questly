import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { AdminResetUserForm } from '@/components/AdminResetUserForm';

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

interface DailyDebugResponse { tiles: Array<{ id: string; title: string; difficulty: string }>; meta: { source: string; debug?: { today: string; debugReason?: string; via: string; isPremium?: boolean | null; keyMeta?: { usedService: boolean; role?: string; disableService: boolean; keyType?: string }; dailySelectError?: string; rpcError?: string } } }

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
  // Server actions (defined here so they share closure + password gate)
  async function rotateDaily(force: boolean) {
    'use server';
    const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    await fetch(`${base}/api/admin/rotate-daily${force ? '?force=1' : ''}` , { cache: 'no-store', headers: { 'x-cron-secret': process.env.CRON_SECRET || '' } });
  }
  async function snapshotLeaderboard() {
    'use server';
    const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    await fetch(`${base}/api/admin/snapshot-leaderboard`, { method: 'POST', cache: 'no-store', headers: { 'x-cron-secret': process.env.CRON_SECRET || '' } });
  }
  async function generateSchedule(formData: FormData) {
    'use server';
    const start = String(formData.get('start') || '').trim();
    const end = String(formData.get('end') || '').trim();
    const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    await fetch(`${base}/api/admin/generate-daily-schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
      body: JSON.stringify({ start, end }),
      cache: 'no-store',
    });
  }
  async function resetAttempts(formData: FormData) {
    'use server';
    const email = String(formData.get('email') || '').trim();
    const topicId = String(formData.get('topicId') || '').trim();
    const date = String(formData.get('date') || '').trim();
    const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    await fetch(`${base}/api/admin/reset-attempts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
      body: JSON.stringify({ email, topicId, date }),
      cache: 'no-store',
    });
  }
  return (
    <main className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-white/80 dark:bg-neutral-950/80 backdrop-blur border-b mb-2 flex flex-wrap gap-2 items-center text-[11px]">
        <span className="font-semibold pr-2 text-neutral-600 dark:text-neutral-300">Admin Panel</span>
        {[
          ['#health','Health'],
          ['#user-sync','User Sync'],
          ['#daily-quests-debug','Daily Debug'],
          ['#rotation-tools','Rotation'],
          ['#schedule-gen','Schedule'],
          ['#reset-attempts','Reset Attempts'],
          ['#reset-user','Reset User'],
          ['#danger','Danger']
        ].map(([href,label]) => (
          <a key={href} href={href} className="px-2 py-1 rounded border hover:bg-neutral-50 dark:hover:bg-neutral-800 transition">{label}</a>
        ))}
        <form action={logout} className="ml-auto">
          <PendingButton className="px-2 py-1 rounded border text-[11px] font-medium bg-white/60 dark:bg-neutral-900/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-[.97] transition focus-visible:ring-2 focus-visible:ring-amber-400" pendingLabel="…" type="submit">Logout</PendingButton>
        </form>
      </div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold mb-4">Admin</h1>
      </div>
      <ul className="list-disc ml-6 space-y-2 mb-8 text-sm">
        <li>Daily rotation & tools consolidated here (legacy /admin/daily kept temporarily).</li>
      </ul>
      <section id="health" className="rounded-xl border p-4 mb-6">
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
      <section id="user-sync" className="rounded-xl border p-4 mb-6">
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
      <section className="rounded-xl border p-4 mb-6" id="daily-quests-debug">
        <h2 className="font-semibold mb-2">Daily Quests (debug)</h2>
        {dailyApi ? (
          <div className="text-sm space-y-3">
            <div className="flex flex-wrap gap-4 items-center">
              <span>API source: <span className="font-mono">{dailyApi.meta.source}</span></span>
              <span>via: {dailyApi.meta.debug?.via}</span>
              {dailyApi.meta.debug?.debugReason && <span className="text-amber-600">{dailyApi.meta.debug.debugReason}</span>}
              <span>ET Date: {dailyApi.meta.debug?.today}</span>
              {dailyApi.meta.debug?.keyMeta && (
                <span className="text-xs opacity-70">Key: {dailyApi.meta.debug.keyMeta.usedService ? 'service' : 'anon'}{dailyApi.meta.debug.keyMeta.disableService ? ' (forced anon)' : ''}{dailyApi.meta.debug.keyMeta.role ? ` (${dailyApi.meta.debug.keyMeta.role})` : ''}{dailyApi.meta.debug.keyMeta.keyType ? ` [${dailyApi.meta.debug.keyMeta.keyType}]` : ''}</span>
              )}
              {dailyApi.meta.debug?.dailySelectError && (
                <span className="text-xs text-rose-600 max-w-[300px] truncate" title={dailyApi.meta.debug.dailySelectError}>err: {dailyApi.meta.debug.dailySelectError}</span>
              )}
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
      <section id="rotation-tools" className="rounded-xl border p-4 mb-6">
        <h2 className="font-semibold mb-2">Rotation Tools</h2>
        <div className="flex flex-wrap gap-3 text-xs mb-4">
          <form action={async () => { 'use server'; await rotateDaily(true); }}>
            <PendingButton pendingLabel="Rotating…" className="px-3 py-2 rounded bg-black text-white text-xs font-semibold hover:bg-neutral-800 active:scale-[.96] transition focus-visible:ring-2 focus-visible:ring-amber-400">Force Rotate Now</PendingButton>
          </form>
          <form action={async () => { 'use server'; await snapshotLeaderboard(); }}>
            <PendingButton pendingLabel="Snapping…" className="px-3 py-2 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 active:scale-[.96] transition focus-visible:ring-2 focus-visible:ring-amber-400">Snapshot Leaderboard</PendingButton>
          </form>
        </div>
        <p className="text-[11px] opacity-60">Uses /api/admin/rotate-daily & /api/admin/snapshot-leaderboard with cron secret.</p>
      </section>
      <section id="schedule-gen" className="rounded-xl border p-4 mb-6">
        <h2 className="font-semibold mb-3">Generate Daily Schedule (Range)</h2>
        <form action={generateSchedule} className="flex flex-col gap-3 text-sm max-w-md">
          <label>Start date (YYYY-MM-DD)
            <input name="start" className="mt-1 w-full border rounded px-2 py-1" placeholder="2025-09-06" defaultValue={today} />
          </label>
          <label>End date (YYYY-MM-DD)
            <input name="end" className="mt-1 w-full border rounded px-2 py-1" placeholder="2026-01-01" />
          </label>
          <PendingButton pendingLabel="Generating…" className="self-start px-4 py-2 rounded bg-black text-white text-sm font-medium hover:bg-neutral-800 active:scale-[.96] transition focus-visible:ring-2 focus-visible:ring-amber-400" type="submit">Generate</PendingButton>
        </form>
      </section>
      <section id="reset-attempts" className="rounded-xl border p-4 mb-6">
        <h2 className="font-semibold mb-3">Reset Attempts (Support)</h2>
        <form action={resetAttempts} className="grid gap-3 text-sm max-w-md">
          <label>User email
            <input name="email" className="mt-1 w-full border rounded px-2 py-1" placeholder="user@example.com" />
          </label>
          <label>Topic ID (optional)
            <input name="topicId" className="mt-1 w-full border rounded px-2 py-1" placeholder="domain-topic-beginner" />
          </label>
          <label>Date (optional YYYY-MM-DD)
            <input name="date" className="mt-1 w-full border rounded px-2 py-1" placeholder="2025-09-06" />
          </label>
          <PendingButton pendingLabel="Resetting…" className="self-start px-4 py-2 rounded bg-rose-600 text-white text-sm font-semibold hover:bg-rose-500 active:scale-[.96] transition focus-visible:ring-2 focus-visible:ring-amber-400" type="submit">Reset</PendingButton>
        </form>
      </section>
      <section id="reset-user" className="rounded-xl border p-4 mb-6">
        <h2 className="font-semibold mb-2">Reset User (Danger)</h2>
  <p className="text-[11px] opacity-70 mb-3 leading-relaxed max-w-xl">Wipe a user&apos;s quiz attempts (and answers), progress rows, points, streak, chat usage, and/or leaderboard entries. Provide an email & scopes. Requires cron secret + admin password.</p>
        <div className="bg-neutral-50 dark:bg-neutral-900 rounded p-4">
          <ResetUserActionWrapper />
          <SelfResetButton />
        </div>
      </section>
      <section id="danger" className="rounded-xl border p-4 mb-10">
        <h2 className="font-semibold mb-2">Danger / Notes</h2>
        <ul className="list-disc ml-5 text-xs space-y-1">
          <li>All destructive actions require CRON_SECRET env present (or non-prod).</li>
          <li>Legacy /admin/daily page will be removed after verification.</li>
          <li>Consider adding role-based auth to replace password layer.</li>
        </ul>
      </section>
      <p className="text-xs opacity-60">Temp password layer. Remove when role-based auth is in place. All admin utilities centralized here.</p>
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

async function resetUserAction(_prev: unknown, formData: FormData) {
  'use server';
  const email = String(formData.get('email') || '').trim();
  if (!email) return { error: 'email required' };
  const date = String(formData.get('date') || '').trim();
  const flags = ['all','resetPoints','resetStreak','resetChat','resetLeaderboard'] as const;
  const payload: Record<string, unknown> = { email };
  for (const f of flags) if (formData.get(f)) payload[f] = true;
  if (!payload['all'] && date) payload.date = date;
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  try {
    const r = await fetch(`${base}/api/admin/reset-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || 'request failed', summary: j };
    return { ok: true, summary: j };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function ResetUserActionWrapper() {
  return <AdminResetUserForm action={resetUserAction} />;
}

import { currentUser } from '@clerk/nextjs/server';
import PendingButton from '@/components/PendingButton';
async function selfResetAction() {
  'use server';
  const u = await currentUser();
  if (!u?.emailAddresses?.[0]?.emailAddress) return;
  const email = u.emailAddresses[0].emailAddress.toLowerCase();
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  try {
    await fetch(`${base}/api/admin/reset-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
      body: JSON.stringify({ email, all: true, resetPoints: true, resetStreak: true, resetChat: true, resetLeaderboard: true }),
      cache: 'no-store'
    });
  } catch {}
}

function SelfResetButton() {
  return (
    <form action={selfResetAction} className="mt-6">
  <PendingButton pendingLabel="Resetting…" type="submit" className="px-4 py-2 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 active:scale-[.96] transition focus-visible:ring-2 focus-visible:ring-amber-400">Reset Everything For Me</PendingButton>
      <p className="mt-2 text-[10px] opacity-60 max-w-sm">Clears ALL your attempts, progress, points, streak, chat usage & leaderboard rows so you can test from a clean slate.</p>
    </form>
  );
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
        <PendingButton pendingLabel="…" className="px-4 py-2 rounded bg-black text-white w-full font-semibold hover:bg-neutral-800 active:scale-[.97] transition focus-visible:ring-2 focus-visible:ring-amber-400" type="submit">Enter</PendingButton>
      </form>
    </main>
  );
}

// PendingButton moved to components/PendingButton.tsx
