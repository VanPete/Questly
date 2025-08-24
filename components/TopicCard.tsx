'use client';
import Link from 'next/link';
// import { motion } from 'framer-motion';

export default function TopicCard({
  id,
  title,
  blurb,
  difficulty,
  domain,
}: {
  id: string; title: string; blurb: string; difficulty: string; domain: string;
}) {
  return (
    <div
      className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 shadow-sm bg-white/90 dark:bg-neutral-900/60 transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800">{domain}</span>
        <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800">{difficulty}</span>
      </div>
      <h3 className="font-semibold text-lg mb-1 line-clamp-1">{title}</h3>
      <p className="text-sm opacity-80 line-clamp-2 mb-3">{blurb}</p>
      <Link
        href={`/topic/${id}`}
        className="inline-flex items-center text-sm font-medium underline-offset-4 hover:underline"
      >
        Explore →
      </Link>
  </div>
  );
}