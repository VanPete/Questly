import Link from 'next/link';
import PremiumHint from '@/components/PremiumHint';

type Tile = { id: string; title: string; blurb: string; difficulty: string };

export default async function DailyPage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/daily`, { cache: 'no-store' });
  const data = (res.ok ? await res.json() : { tiles: [] }) as { tiles: Tile[] };
  const tiles = data.tiles ?? [];
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <h1 className="text-2xl font-bold mb-4">Today&apos;s Quests</h1>
  {/* Show premium hint when only 3 tiles are available */}
  {tiles.length === 3 && <PremiumHint />}
  {/* Show a small toast if redirected after upgrade */}
  <UpgradeToast />
  <div className="grid gap-8 md:grid-cols-3 md:items-stretch md:justify-items-stretch">
        {tiles.map((t) => (
          <Link
            key={t.id}
            href={`/topic/${t.id}`}
            className="block border border-neutral-200 rounded-lg p-5 bg-white hover:bg-gray-50 w-full h-full transition-transform transform will-change-transform hover:scale-[1.02] hover:shadow-lg duration-200 ease-out"
          >
            <div className="flex flex-col h-full">
              <div className="text-sm opacity-60">{t.difficulty}</div>
              <div className="font-semibold text-lg mt-2">{t.title}</div>
              <div className="text-sm opacity-80 mt-3 flex-grow">{t.blurb}</div>
            </div>
          </Link>
        ))}
      </div>
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
