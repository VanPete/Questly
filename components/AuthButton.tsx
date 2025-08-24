'use client';
import { useSupabaseUser } from '@/lib/user';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function AuthButton() {
  const user = useSupabaseUser();
  if (!user) {
    return <Link href="/login" className="text-sm underline underline-offset-4">Sign in</Link>;
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs opacity-70 max-w-[160px] truncate">{user.email}</span>
      <button onClick={()=>supabase.auth.signOut()} className="text-sm underline underline-offset-4">Sign out</button>
    </div>
  );
}
