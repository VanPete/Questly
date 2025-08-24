'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import TopicGrid from '@/components/TopicGrid';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';

const DOMAINS = ['People','Places','Ideas','History','Math','Military History','Science'];
const DIFFS = ['Beginner','Intermediate','Advanced'];

function PageContent() {
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

      <Suspense fallback={<div className="w-full max-w-5xl mb-4">Loading Daily Quest…</div>}>
        <DailyQuestStrip />
      </Suspense>

      <div className="flex gap-2 mb-4 flex-wrap justify-center">
        <select
          value={domain}
          onChange={e=>setDomain(e.target.value)}
          className="border rounded-xl px-3 py-2"
          aria-label="Select domain"
        >
          <option value="">All domains</option>
          {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <select
          value={difficulty}
          onChange={e=>setDifficulty(e.target.value)}
          className="border rounded-xl px-3 py-2"
          aria-label="Select difficulty"
        >
          <option value="">All levels</option>
          {DIFFS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <button onClick={apply} className="border rounded-xl px-3 py-2">Apply</button>
        <button onClick={()=>{ setDomain(''); setDifficulty(''); router.push('/'); }} className="border rounded-xl px-3 py-2">
          Shuffle
        </button>
      </div>

  <ResumeSection />

  <TopicGrid />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="text-center py-10">Loading…</div>}>
      <PageContent />
    </Suspense>
  );
}

function ResumeSection() {
  const [convos, setConvos] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    fetch('/api/conversations').then(r=>r.json()).then(d=> setConvos(d.conversations ?? [])).catch(()=>{});
  }, []);
  if (!convos?.length) return null;
  return (
    <div className="w-full max-w-5xl mb-6">
      <h3 className="font-semibold mb-2">Resume</h3>
      <div className="flex gap-2 flex-wrap">
        {convos.map(c => (
          <Link key={c.id} href={`/topic/${c.title ? c.title.toLowerCase().replace(/\s+/g,'-') : 't'}`}
            className="px-3 py-2 rounded-xl border text-sm">
            {c.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

function DailyQuestStrip() {
  const [tiles, setTiles] = useState<Array<{ id: string; title: string; blurb: string }>>([]);
  useEffect(() => {
    fetch('/api/daily').then(r=>r.json()).then(d=> setTiles(d.tiles ?? [])).catch(()=>{});
  }, []);
  if (!tiles?.length) return null;
  return (
    <div className="w-full max-w-5xl mb-6">
      <h3 className="font-semibold mb-2">Daily Quest</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tiles.map(t => (
          <Link key={t.id} href={`/topic/${t.id}`} className="block rounded-2xl border p-4 bg-white/80 dark:bg-neutral-900/50">
            <div className="font-medium mb-1">{t.title}</div>
            <div className="text-sm opacity-80 line-clamp-2">{t.blurb}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
