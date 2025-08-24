// Leaderboard page

async function fetchDaily(date?: string) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/leaderboard/daily${qs}`, { cache: 'no-store' });
  if (!res.ok) return { date: date || new Date().toISOString().slice(0,10), results: [] as Array<{ user_id: string; rank: number; points: number }>} ;
  return res.json();
}

async function fetchLifetime() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/leaderboard/lifetime`, { cache: 'no-store' });
  if (res.status === 403) return { premiumRequired: true } as const;
  if (!res.ok) return { results: [] as Array<{ user_id: string; rank: number; points: number }> };
  return res.json();
}

export default async function LeaderboardPage() {
  const [daily, lifetime] = await Promise.all([fetchDaily(), fetchLifetime()]);
  return (
    <main className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Daily Leaderboard</h1>
      <p className="opacity-80 mb-2">{daily.date}</p>
      {daily.results.length === 0 ? (
        <p className="opacity-70">No results yet. Come back after today’s quests!</p>
      ) : (
        <ul className="divide-y">
      {daily.results.map((r: { user_id: string; name?: string|null; rank: number; points: number }) => (
            <li key={r.user_id} className="py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-6 text-right">{r.rank}</span>
        <span className="text-sm opacity-80">{r.name || r.user_id.slice(0,8)}</span>
              </div>
              <div className="text-sm">{r.points} pts</div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="text-xl font-semibold mt-8 mb-2">Lifetime Leaderboard</h2>
      {'premiumRequired' in lifetime ? (
        <p className="opacity-80 text-sm">Premium required to view lifetime rankings. <a href="/upgrade" className="underline">Upgrade</a></p>
      ) : (
        (lifetime.results?.length ? (
          <ul className="divide-y">
    {lifetime.results.map((r: { user_id: string; name?: string|null; rank: number; points: number }) => (
              <li key={r.user_id} className="py-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-right">{r.rank}</span>
      <span className="text-sm opacity-80">{r.name || r.user_id.slice(0,8)}</span>
                </div>
                <div className="text-sm">{r.points} pts</div>
              </li>
            ))}
          </ul>
        ) : <p className="opacity-70 text-sm">No lifetime results yet.</p>)
      )}
    </main>
  );
}
