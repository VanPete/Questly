'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import TopicGrid from '@/components/TopicGrid';
import { useState } from 'react';

const DOMAINS = ['People','Places','Ideas','History','Math','Military History','Science'];
const DIFFS = ['Beginner','Intermediate','Advanced'];

export default function Page() {
  const router = useRouter();
  const search = useSearchParams();
  const [domain, setDomain] = useState(search.get('domain') ?? '');
  const [difficulty, setDifficulty] = useState(search.get('difficulty') ?? '');

  function apply() {
    const params = new URLSearchParams();
    if (domain) params.set('domain', domain);
    if (difficulty) params.set('difficulty', difficulty);
    router.push(`/?${params.toString()}`);
  }

  return (
    <main className="flex flex-col items-center">
      <div className="text-center max-w-xl mb-6">
        <h2 className="text-xl font-semibold">Today&apos;s Quest</h2>
        <p className="opacity-80">Pick a tile. Dive in. Learn something delightful.</p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap justify-center">
        <select value={domain} onChange={e=>setDomain(e.target.value)} className="border rounded-xl px-3 py-2">
          <option value="">All domains</option>
          {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select value={difficulty} onChange={e=>setDifficulty(e.target.value)} className="border rounded-xl px-3 py-2">
          <option value="">All levels</option>
          {DIFFS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <button onClick={apply} className="border rounded-xl px-3 py-2">Apply</button>
        <button onClick={()=>{ setDomain(''); setDifficulty(''); router.push('/'); }} className="border rounded-xl px-3 py-2">
          Shuffle
        </button>
      </div>

      <TopicGrid />
    </main>
  );
}
