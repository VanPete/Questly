// Leaderboard page

async function fetchDaily(date?: string) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/leaderboard/daily${qs}`, { cache: 'no-store' });
  if (!res.ok) return { date: date || new Date().toISOString().slice(0,10), results: [] as Array<{ user_id: string; rank: number; points: number }>} ;
  return res.json();
}

export default async function LeaderboardPage() {
  const data = await fetchDaily();
  return (
    <main className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Daily Leaderboard</h1>
      <p className="opacity-80 mb-2">{data.date}</p>
      {data.results.length === 0 ? (
        <p className="opacity-70">No results yet. Come back after today’s quests!</p>
      ) : (
        <ul className="divide-y">
          {data.results.map((r: { user_id: string; rank: number; points: number }) => (
            <li key={r.user_id} className="py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-6 text-right">{r.rank}</span>
                <span className="font-mono text-sm opacity-80">{r.user_id.slice(0,8)}</span>
              </div>
              <div className="text-sm">{r.points} pts</div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
