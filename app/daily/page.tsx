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
  {tiles.length === 3 && <PremiumHint />}
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
