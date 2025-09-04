import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export type SupaUser = { id: string; email?: string | null } | null;

export function useSupabaseUser() {
  const [user, setUser] = useState<SupaUser>(null);
  useEffect(() => {
    let mounted = true;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      // In tests or non-configured environments, just stay null
      return () => { mounted = false; };
    }
    const client = createClient(url, key);
    client.auth.getUser().then(({ data }) => { if (mounted) setUser(data.user ? { id: data.user.id, email: data.user.email } : null); });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);
  return user;
}

export async function getAccessToken(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key);
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}
