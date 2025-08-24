'use client';
import AuthButton from '@/components/AuthButton';

export default function HeaderRight() {
  return (
    <div className="flex items-center gap-4">
      <p className="text-sm opacity-70 hidden sm:block">Learn something fun today</p>
      <AuthButton />
    </div>
  );
}
