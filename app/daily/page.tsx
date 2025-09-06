import Link from 'next/link';
import PremiumHint from '@/components/PremiumHint';

type Tile = { id: string; title: string; blurb: string; difficulty: string };
interface DailyMeta { source?: string; debug?: Record<string, unknown>; }

export const dynamic = 'force-dynamic';

export default async function DailyPage() {
  // Use relative path so auth cookies are forwarded automatically (ensures premium tiles show up)
  let res: Response;
  try {
    res = await fetch(`/api/daily`, { cache: 'no-store' });
  } catch {
    // Fallback to absolute if relative failed (rare on some runtimes)
    const base = process.env.NEXT_PUBLIC_SITE_URL || '';
    res = await fetch(`${base}/api/daily`, { cache: 'no-store' });
  }
  const data = (res.ok ? await res.json() : { tiles: [], meta: {} }) as { tiles: Tile[]; meta?: DailyMeta };
  const tiles = data.tiles ?? [];
  const free = tiles.slice(0, 3);
  const premium = tiles.length > 3 ? tiles.slice(3) : [];
  return (
    <div className="min-h-[70vh] flex items-start justify-center p-4">
      <div className="w-full max-w-3xl sm:max-w-4xl">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold tracking-tight">Today&apos;s Quests</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {formatDate(new Date())} • {tiles.length} {tiles.length === 1 ? 'quest' : 'quests'}
          </p>
        </div>
        {/* Show premium hint only if exactly free trio present */}
        {tiles.length === 3 && <PremiumHint />}
        {/* Show a small toast if redirected after upgrade */}
        <UpgradeToast />
        <QuestGrid tiles={free} offset={0} label={premium.length > 0 ? 'Free Quests' : undefined} />
        {premium.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-semibold mb-3">Premium Bonus</h2>
            <QuestGrid tiles={premium} offset={free.length} />
          </div>
        )}
      </div>
    </div>
  );
}

function QuestGrid({ tiles, offset, label }: { tiles: Tile[]; offset: number; label?: string }) {
  if (tiles.length === 0) return null;
  return (
    <div className="mt-6">
      {label && <h2 className="text-xl font-semibold mb-3">{label}</h2>}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 md:items-stretch md:justify-items-stretch">
        {tiles.map((t, i) => (
          <Link
            key={t.id}
            href={`/topic/${t.id}`}
            aria-label={`Open topic: ${t.title}`}
            className={`group block rounded-xl border border-neutral-200/80 dark:border-neutral-800 p-5 bg-white/95 dark:bg-neutral-900/70 ring-1 ring-neutral-200/70 dark:ring-neutral-800 shadow-sm hover:shadow-md hover:bg-white dark:hover:bg-neutral-900 w-full h-full transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950 tile-entrance`}
            style={{ animationDelay: `${(offset + i) * 60}ms` }}
          >
            <div className="flex flex-col h-full">
              <div className="mb-2 flex items-center justify-between">
                <span className={badgeClass(t.difficulty)}>{t.difficulty}</span>
              </div>
              <div className="font-semibold text-lg mt-1 max-w-[65ch] line-clamp-2">{t.title}</div>
              <div className="text-sm text-neutral-700 dark:text-neutral-300 mt-3 flex-grow max-w-[65ch] line-clamp-3">{t.blurb}</div>
              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                <span className="opacity-90">Start</span>
                <svg className="w-4 h-4 translate-x-0 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 11-1.414-1.414L13.586 11H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function UpgradeToast() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const upgraded = params.get('upgraded');
  if (!upgraded) return null;
  return (
    <div className="mb-4 p-3 rounded-lg border border-green-200 bg-green-50 text-sm text-green-900 dark:border-green-800/60 dark:bg-green-900/20 dark:text-green-200">
      Thanks for upgrading! Premium unlocked.
    </div>
  );
}

function formatDate(d: Date) {
  try {
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

function badgeClass(level: string) {
  const base = 'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ring-1';
  const L = (level || '').toLowerCase();
  if (L.startsWith('begin')) return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200 dark:ring-emerald-900/40`;
  if (L.startsWith('inter')) return `${base} bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:ring-blue-900/40`;
  if (L.startsWith('adv')) return `${base} bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-900/20 dark:text-purple-200 dark:ring-purple-900/40`;
  return `${base} bg-neutral-100 text-neutral-700 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700`;
}
