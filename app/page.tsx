import TopicGrid from '@/components/TopicGrid';

export default function Page() {
  return (
    <main className="flex flex-col items-center">
      <div className="text-center max-w-xl mb-6">
        <h2 className="text-xl font-semibold">Today&#39;s Quest</h2>
        <p className="opacity-80">Pick a tile. Dive in. Learn something delightful.</p>
      </div>
      <TopicGrid />
    </main>
  );
}