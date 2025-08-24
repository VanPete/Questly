import Link from 'next/link';
import PremiumHint from '@/components/PremiumHint';

type Tile = { id: string; title: string; blurb: string; difficulty: string };

export default async function DailyPage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/daily`, { cache: 'no-store' });
  const data = (res.ok ? await res.json() : { tiles: [] }) as { tiles: Tile[] };
  const tiles = data.tiles ?? [];
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Today&apos;s Quests</h1>
  {/* Show premium hint when only 3 tiles are available */}
  {tiles.length === 3 && <PremiumHint />}
  {/* Show a small toast if redirected after upgrade */}
  <UpgradeToast />
      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.id} href={`/topic/${t.id}`} className="block border rounded-lg p-4 hover:bg-gray-50">
            <div className="text-sm opacity-60">{t.difficulty}</div>
            <div className="font-semibold">{t.title}</div>
            <div className="text-sm opacity-80 mt-1">{t.blurb}</div>
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
    <div className="mb-4 p-3 rounded-lg border bg-green-50 text-sm">
      Thanks for upgrading! Premium unlocked.
    </div>
  );
}
