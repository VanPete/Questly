'use client';
import Link from 'next/link';
import { track } from '@vercel/analytics';
import React from 'react';

export default function TrackableLink({ href, children, className, eventName }: { href: string; children: React.ReactNode; className?: string; eventName?: string; }) {
  return (
    <Link href={href} className={className} onClick={() => { if (eventName) track(eventName); }}>
      {children}
    </Link>
  );
}
