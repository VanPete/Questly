'use client';
import Link from 'next/link';
import { track } from '@vercel/analytics';
import React from 'react';

type Props = React.ComponentProps<typeof Link> & {
  eventName?: string;
  'data-analytics-cta'?: string;
};

export default function TrackableLink({ href, children, className, eventName, ...rest }: Props) {
  return (
    <Link href={href} className={className} onClick={() => { if (eventName) track(eventName); }} {...rest}>
      {children}
    </Link>
  );
}
