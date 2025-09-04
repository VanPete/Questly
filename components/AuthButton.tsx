 'use client';
import { useSupabaseUser } from '@/lib/user';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AuthButton() {
  const user = useSupabaseUser();
  const pathname = usePathname();
  if (!user) {
    const returnTo = pathname || '/daily';
    return <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="text-sm underline underline-offset-4">Sign in</Link>;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs opacity-70 max-w-[160px] truncate">{user.email}</span>
      <button onClick={()=>supabase.auth.signOut()} className="text-sm underline underline-offset-4">Sign out</button>
    </div>
  );
}
