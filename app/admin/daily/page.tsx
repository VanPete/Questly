import { getServerClient } from '@/lib/supabaseServer';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireAdmin() {
  const supabase = await getServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect('/login?returnTo=%2Fadmin%2Fdaily');
  // Simple admin gate: require email domain allowlist via env, or fallback to any signed-in user
  const allow = process.env.ADMIN_EMAIL_DOMAIN;
  if (allow && !data.user.email?.toLowerCase().endsWith(`@${allow.toLowerCase()}`)) redirect('/');
  return supabase;
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
    </main>
  );
}
