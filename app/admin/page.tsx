import Link from 'next/link';

export default function AdminIndex() {
  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Admin</h1>
      <ul className="list-disc ml-6 space-y-2">
        <li><Link className="underline" href="/admin/daily">Daily rotation</Link></li>
      </ul>
    </main>
  );
}
