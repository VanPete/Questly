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
    return <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="text-sm underline underline-offset-4 hover:opacity-90">Sign in</Link>;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs opacity-70 max-w-[160px] truncate">{user.email}</span>
      <button
        onClick={async ()=>{
          await supabase.auth.signOut();
          // Force a small client-side refresh to update SWR caches/UI
          if (typeof window !== 'undefined') window.location.reload();
        }}
        className="text-sm underline underline-offset-4 hover:opacity-90"
      >
        Sign out
      </button>
    </div>
  );
}
