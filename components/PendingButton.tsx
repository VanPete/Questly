"use client";
import React from 'react';
import { useFormStatus } from 'react-dom';

interface PendingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pendingLabel?: string;
}

export default function PendingButton({ pendingLabel = 'Working…', className = '', children, ...rest }: PendingButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      className={`${className} relative transition disabled:opacity-60 ${pending ? 'opacity-70 pointer-events-none' : ''}`}
      {...(pending ? { 'aria-busy': 'true' } : {})}
    >
      <span className="inline-flex items-center gap-1">{pending ? pendingLabel : children}</span>
    </button>
  );
}
