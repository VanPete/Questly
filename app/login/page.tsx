'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="max-w-md mx-auto"><h2 className="text-2xl font-semibold mb-3">Sign in</h2><div className="opacity-70">Loading…</div></main>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params?.get('returnTo') || '/daily';

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        // After sign-in, route new users to set a display name; returning users go to returnTo
        try {
          const token = session?.access_token;
          const res = await fetch('/api/profile', {
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          const payload = await res.json().catch(() => ({}));
          const hasName = !!payload?.profile?.display_name;
          if (hasName) router.push(returnTo);
          else router.push(`/profile?setup=1&returnTo=${encodeURIComponent(returnTo)}`);
        } catch {
          // On any error, send them to setup page; they can save or skip back to quests
          router.push(`/profile?setup=1&returnTo=${encodeURIComponent(returnTo)}`);
        }
      }
    });
    const sub = data?.subscription;
    return () => sub?.unsubscribe();
  }, [router, returnTo]);

  return (
    <main className="max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-3">Sign in</h2>
      <div className="rounded-2xl border p-4">
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={["google", "azure", "apple"]}
          onlyThirdPartyProviders={false}
        />
      </div>
    </main>
  );
}
