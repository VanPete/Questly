'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="max-w-md mx-auto"><div className="opacity-70">Loading…</div></main>}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params?.get('returnTo') || '/daily';
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');

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
      <div className="rounded-2xl border p-4 space-y-6">
        <div>
          <h2 className="font-semibold mb-2">Sign in with username or email</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              setLoading(true);
              try {
                const identifier = username || email;
                if (!identifier || !password) {
                  setErr('Enter username/email and password');
                  return;
                }
                let signInEmail = identifier;
                if (!/.+@.+\..+/.test(identifier)) {
                  const res = await fetch('/api/auth/resolve-identifier', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier }),
                  });
                  const payload = await res.json();
                  if (!res.ok) throw new Error(payload?.error || 'User not found');
                  signInEmail = payload.email;
                }
                const { error } = await supabase.auth.signInWithPassword({ email: signInEmail, password });
                if (error) throw error;
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Sign-in failed';
                setErr(msg);
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-2"
          >
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="Username (or leave blank if using email)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="Email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="w-full border rounded px-3 py-2"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {err && <div className="text-red-600 text-sm">{err}</div>}
            <button className="btn btn-primary px-4 py-2 rounded bg-black text-white hover:opacity-90 active:opacity-80 transition disabled:opacity-50 cursor-pointer" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <div>
          <h2 className="font-semibold mb-2">Or create an account with a username</h2>
          <UsernameSignup />
        </div>

        <div>
          <h2 className="font-semibold mb-2">Or use a provider</h2>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa, variables: { default: { colors: { brand: '#000000', brandAccent: '#111111' } } } }}
            providers={["google", "azure", "apple"]}
            onlyThirdPartyProviders={true}
          />
        </div>
      </div>
    </main>
  );
}

function UsernameSignup() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setLoading(true);
        try {
          const res = await fetch('/api/auth/username-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, email: email || undefined }),
          });
          const payload = await res.json();
          if (!res.ok) throw new Error(payload?.error || 'Signup failed');
          const usedEmail = payload.email as string;
          // Now sign them in
          const { error } = await supabase.auth.signInWithPassword({ email: usedEmail, password });
          if (error) throw error;
          // After sign-in, route to setup/profile logic handled by onAuthStateChange in LoginInner
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Signup failed';
          setErr(msg);
        } finally {
          setLoading(false);
        }
      }}
      className="space-y-2"
    >
      <input
        className="w-full border rounded px-3 py-2"
        placeholder="Username (3–24, letters/numbers/underscore)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
  <div className="text-xs text-neutral-600 dark:text-neutral-400 -mt-1 mb-1">Your username is public and becomes your profile name.</div>
      <input
        className="w-full border rounded px-3 py-2"
        placeholder="Password (min 8 chars)"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        className="w-full border rounded px-3 py-2"
        placeholder="Email (optional)"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
  <div className="text-xs text-neutral-600 dark:text-neutral-400 -mt-1 mb-1">Optional. Used for recovery or receipts. No email confirmation is required.</div>
  {err && <div className="text-red-600 text-sm">{err}</div>}
  <button className="btn btn-secondary px-4 py-2 rounded border hover:bg-neutral-50 active:bg-neutral-100 transition disabled:opacity-50 cursor-pointer" disabled={loading}>
        {loading ? 'Creating…' : 'Create Account'}
      </button>
    </form>
  );
}
