import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export type SupaUser = { id: string; email?: string | null } | null;

export function useSupabaseUser() {
  const [user, setUser] = useState<SupaUser>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => { if (mounted) setUser(data.user ? { id: data.user.id, email: data.user.email } : null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);
  return user;
}
