import Link from 'next/link';

export default function Page() {
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center text-center">
      <div>
        <h1 className="text-4xl font-bold mb-4">Questly</h1>
        <p className="opacity-80 mb-8">3 Topics. 3 Quests. Test your mind daily.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/daily" className="px-5 py-3 rounded-2xl bg-black text-white">Play Today’s 3</Link>
          <Link href="/login" className="px-5 py-3 rounded-2xl border">Login / Sign Up</Link>
          <Link href="/leaderboard" className="px-5 py-3 rounded-2xl border">Leaderboard</Link>
        </div>
      </div>
    </main>
  );
}
