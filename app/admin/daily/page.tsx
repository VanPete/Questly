import { getServerClient } from '@/lib/supabaseServer';
import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireAdmin() {
  const u = await currentUser();
  if (!u?.id) redirect('/login?returnTo=%2Fadmin%2Fdaily');
  // Simple admin gate: require email domain allowlist via env, or fallback to any signed-in user
  const email = (u.primaryEmailAddress?.emailAddress || u.emailAddresses?.[0]?.emailAddress || '').toLowerCase();
  const allowDomain = process.env.ADMIN_EMAIL_DOMAIN;
  const allowEmails = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  const domainOk = allowDomain ? email.endsWith(`@${allowDomain.toLowerCase()}`) : false;
  const emailOk = allowEmails.length ? allowEmails.includes(email) : false;
  if (!(domainOk || emailOk || (!allowDomain && allowEmails.length === 0))) redirect('/');
  return await getServerClient();
}

async function getTodayRow() {
  const supabase = await getServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('daily_topics')
    .select('*')
    .eq('date', today)
    .maybeSingle();
  return data;
}

async function previewTomorrow() {
  const supabase = await getServerClient();
  const { data: topics } = await supabase
    .from('topics')
    .select('id,difficulty')
    .eq('is_active', true)
    .limit(3000);
  if (!topics || topics.length < 3) return null;
  const pickRand = (diff: string) => {
    const c = topics.filter(t => t.difficulty === diff);
    if (c.length === 0) return undefined;
    const idx = Math.floor(Math.random() * c.length);
    return c[idx]?.id;
  };
  const b = pickRand('Beginner');
  const i = pickRand('Intermediate');
  const a = pickRand('Advanced');
  const extras: string[] = [];
  const byDiff: Record<string, string[]> = { Beginner: [], Intermediate: [], Advanced: [] };
  for (const t of topics) {
    if (t.difficulty === 'Beginner' && t.id !== b) byDiff.Beginner.push(t.id);
    if (t.difficulty === 'Intermediate' && t.id !== i) byDiff.Intermediate.push(t.id);
    if (t.difficulty === 'Advanced' && t.id !== a) byDiff.Advanced.push(t.id);
  }
  const pickN = (arr: string[], n: number) => {
    const out: string[] = [];
    const used = new Set<number>();
    const count = Math.min(n, arr.length);
    while (out.length < count) {
      const idx = Math.floor(Math.random() * arr.length);
      if (used.has(idx)) continue;
      used.add(idx);
      out.push(arr[idx]!);
    }
    return out;
  };
  extras.push(...pickN(byDiff.Beginner, 2), ...pickN(byDiff.Intermediate, 2), ...pickN(byDiff.Advanced, 2));
  return { beginner_id: b, intermediate_id: i, advanced_id: a, premium_extra_ids: extras };
}

async function rotate(force: boolean) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const res = await fetch(`${base}/api/admin/rotate-daily${force ? '?force=1' : ''}`, { cache: 'no-store', headers: { 'x-cron-secret': process.env.CRON_SECRET || '' } });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, body: j } as { ok: boolean; body: unknown };
}

export default async function DailyAdminPage() {
  await requireAdmin();
  const row = await getTodayRow();
  const tomorrow = await previewTomorrow();
  const today = new Date().toISOString().slice(0, 10);
  async function generateSchedule(formData: FormData) {
    'use server';
    await requireAdmin();
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
    await requireAdmin();
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
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Daily rotation</h1>
      <p className="opacity-70 mb-4">ET business date: {today}</p>
      <div className="rounded-xl border p-4 mb-4">
        <div className="font-semibold mb-2">Today</div>
        {row ? (
          <pre className="text-xs bg-neutral-50 dark:bg-neutral-900 p-3 rounded-lg overflow-auto">{JSON.stringify(row, null, 2)}</pre>
        ) : (
          <div className="text-sm">No row set for today.</div>
        )}
      </div>
      <div className="rounded-xl border p-4 mb-4">
        <div className="font-semibold mb-2">Preview (randomized) for tomorrow</div>
        {tomorrow ? (
          <pre className="text-xs bg-neutral-50 dark:bg-neutral-900 p-3 rounded-lg overflow-auto">{JSON.stringify(tomorrow, null, 2)}</pre>
        ) : (
          <div className="text-sm">Not enough topics to preview.</div>
        )}
      </div>
      <form action={async () => { 'use server'; await rotate(true); }}>
        <button className="px-4 py-2 rounded-lg bg-black text-white">Force rotate now</button>
      </form>

      <hr className="my-6" />
      <section id="schedule-gen" className="rounded-xl border p-4 mb-4">
        <div className="font-semibold mb-3">Generate daily schedule (range)</div>
        <form action={generateSchedule} className="flex flex-col gap-3">
          <label className="text-sm">Start date (YYYY-MM-DD)
            <input className="block mt-1 border rounded px-2 py-1" name="start" placeholder="2025-09-06" defaultValue={today} />
          </label>
          <label className="text-sm">End date (YYYY-MM-DD)
            <input className="block mt-1 border rounded px-2 py-1" name="end" placeholder="2026-09-05" />
          </label>
          <button className="self-start px-3 py-2 rounded bg-black text-white">Generate</button>
        </form>
      </section>

      <section id="reset-tools" className="rounded-xl border p-4">
        <div className="font-semibold mb-3">Reset attempts (support)</div>
        <form action={resetAttempts} className="grid grid-cols-1 gap-3">
          <label className="text-sm">User email
            <input className="block mt-1 border rounded px-2 py-1" name="email" placeholder="user@example.com" />
          </label>
          <label className="text-sm">Topic ID (optional, leave blank to reset all)
            <input className="block mt-1 border rounded px-2 py-1" name="topicId" placeholder="domain-topic-beginner" />
          </label>
          <label className="text-sm">Date (optional YYYY-MM-DD, filters user_progress rows)
            <input className="block mt-1 border rounded px-2 py-1" name="date" placeholder="2025-09-05" />
          </label>
          <button className="self-start px-3 py-2 rounded bg-rose-600 text-white">Reset</button>
        </form>
      </section>
    </main>
  );
}
