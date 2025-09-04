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
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // navigate to the intended page
        router.push(returnTo);
      }
    });
    const sub = data?.subscription;
    return () => sub?.unsubscribe();
  }, [router, returnTo]);

  return (
    <main className="max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-3">Sign in</h2>
      <div className="rounded-2xl border p-4">
        <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={["google"]} />
      </div>
    </main>
  );
}
