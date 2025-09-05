"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const params = useSearchParams();
  const step = (params?.get("step") || "start") as "start" | "signin" | "create";
  const email = params?.get("email") || "";
  const returnTo = params?.get("returnTo") || "/daily";

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // If we just signed up (we route to upgrade in code), otherwise leave as-is
      }
    });
    return () => data?.subscription.unsubscribe();
  }, []);

  if (step === "signin") return <Signin email={email} returnTo={returnTo} />;
  if (step === "create") return <CreateAccount prefillEmail={email} />;
  return <Start returnTo={returnTo} />;
}

function Start({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const onContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const value = email.trim();
    if (!value) { setErr("Enter your email"); return; }
    router.push(`/login?step=signin&email=${encodeURIComponent(value)}&returnTo=${encodeURIComponent(returnTo)}`);
  };
  const doOAuth = async (provider: "google" | "apple" | "azure") => {
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/daily` } });
  };
  return (
    <main className="min-h-[70vh] flex items-start justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-center mb-4">Log in or create an account</h1>
        <form onSubmit={onContinue} className="space-y-3 rounded-2xl border p-4">
          <div>
            <label htmlFor="start-email" className="text-sm block mb-1">Email address</label>
            <input id="start-email" className="w-full border rounded px-3 py-2" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" type="email" />
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button className="w-full px-4 py-2 rounded bg-black text-white hover:opacity-90 active:opacity-80">Continue</button>
          <div className="relative text-center my-1">
            <span className="px-2 bg-white dark:bg-neutral-950 text-sm opacity-60">or</span>
          </div>
          <p className="text-xs opacity-70 text-center">By continuing, you agree to our Terms and Privacy Policy.</p>
          <div className="space-y-2">
            <button title="Continue with Google" type="button" onClick={()=>doOAuth('google')} className="w-full px-4 py-2 rounded border hover:bg-neutral-50 text-left flex items-center gap-2"><span aria-hidden className="text-lg">🟢</span> Continue with Google</button>
            <button title="Continue with Apple" type="button" onClick={()=>doOAuth('apple')} className="w-full px-4 py-2 rounded border hover:bg-neutral-50 text-left flex items-center gap-2"><span aria-hidden className="text-lg">🍎</span> Continue with Apple</button>
          </div>
          <button title="Continue with SSO" type="button" onClick={()=>doOAuth('azure')} className="w-full text-center text-sm underline mt-2">Continue with work or school single sign-on &gt;</button>
        </form>
      </div>
    </main>
  );
}

function Signin({ email, returnTo }: { email: string; returnTo: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setLoading(true);
    try {
      if (!email || !password) throw new Error('Missing email or password');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(returnTo || '/daily');
    } catch (errUnknown) {
      const m = errUnknown instanceof Error ? errUnknown.message : 'Sign-in failed';
      setErr(m);
    } finally { setLoading(false); }
  };
  return (
    <main className="min-h-[70vh] flex items-start justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-center mb-4">Enter your password</h1>
        <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border p-4">
          <div>
            <label htmlFor="signin-email" className="text-sm block mb-1">Email address</label>
            <input id="signin-email" className="w-full border rounded px-3 py-2 bg-neutral-100 dark:bg-neutral-900" value={email} readOnly aria-readonly="true" />
          </div>
          <div>
            <label htmlFor="signin-password" className="text-sm block mb-1">Password</label>
            <input id="signin-password" className="w-full border rounded px-3 py-2" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          <button disabled={loading} className="w-full px-4 py-2 rounded bg-black text-white hover:opacity-90 active:opacity-80 disabled:opacity-60">{loading? 'Signing in…':'Sign in'}</button>
          <button type="button" onClick={()=>router.push(`/login?step=create&email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(returnTo)}`)} className="w-full text-center text-sm underline">Create a new account with this email</button>
          <button type="button" onClick={()=>router.push(`/login?step=start&returnTo=${encodeURIComponent(returnTo)}`)} className="w-full text-center text-sm underline">Back</button>
        </form>
      </div>
    </main>
  );
}

function CreateAccount({ prefillEmail }: { prefillEmail?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState(prefillEmail ? 'email' : 'username');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(prefillEmail || '');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onCreateUsername = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setLoading(true);
    try {
      const res = await fetch('/api/auth/username-signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, email: email || undefined }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Signup failed');
      const usedEmail = payload.email as string;
      const { error } = await supabase.auth.signInWithPassword({ email: usedEmail, password });
      if (error) throw error;
      router.push('/upgrade?welcome=1');
    } catch (errUnknown) {
      const m = errUnknown instanceof Error ? errUnknown.message : 'Signup failed';
      setErr(m);
    } finally { setLoading(false); }
  };

  const onCreateEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setLoading(true);
    try {
      const res = await fetch('/api/auth/email-signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Signup failed');
      const usedEmail = payload.email as string;
      const { error } = await supabase.auth.signInWithPassword({ email: usedEmail, password });
      if (error) throw error;
      router.push('/upgrade?welcome=1');
    } catch (errUnknown) {
      const m = errUnknown instanceof Error ? errUnknown.message : 'Signup failed';
      setErr(m);
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-[70vh] flex items-start justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-center mb-4">Create your free account</h1>
        <div className="rounded-2xl border">
          <div className="flex">
            <button className={`flex-1 px-4 py-2 text-sm ${tab==='email'?'font-semibold border-b-2 border-black':''}`} onClick={()=>setTab('email')}>With email</button>
            <button className={`flex-1 px-4 py-2 text-sm ${tab==='username'?'font-semibold border-b-2 border-black':''}`} onClick={()=>setTab('username')}>With username</button>
          </div>
          <div className="p-4">
            {tab==='email' ? (
              <form onSubmit={onCreateEmail} className="space-y-3">
                <div>
                  <label htmlFor="create-email" className="text-sm block mb-1">Email address</label>
                  <input id="create-email" className="w-full border rounded px-3 py-2 bg-neutral-100 dark:bg-neutral-900" value={email} onChange={e=>setEmail(e.target.value)} readOnly={!!prefillEmail} placeholder="you@example.com" type="email"/>
                </div>
                <div>
                  <label htmlFor="create-email-password" className="text-sm block mb-1">Password</label>
                  <input id="create-email-password" className="w-full border rounded px-3 py-2" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                {err && <div className="text-red-600 text-sm">{err}</div>}
                <button disabled={loading} className="w-full px-4 py-2 rounded bg-black text-white hover:opacity-90 active:opacity-80 disabled:opacity-60">{loading? 'Creating…':'Create account'}</button>
              </form>
            ) : (
              <form onSubmit={onCreateUsername} className="space-y-3">
                <div>
                  <label htmlFor="create-username" className="text-sm block mb-1">Username</label>
                  <input id="create-username" className="w-full border rounded px-3 py-2" value={username} onChange={e=>setUsername(e.target.value)} placeholder="username" />
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">Your username is public and becomes your profile name.</div>
                </div>
                <div>
                  <label htmlFor="create-username-password" className="text-sm block mb-1">Password</label>
                  <input id="create-username-password" className="w-full border rounded px-3 py-2" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <div>
                  <label htmlFor="create-username-email" className="text-sm block mb-1">Email (optional)</label>
                  <input id="create-username-email" className="w-full border rounded px-3 py-2" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">Optional. Used for recovery or receipts. No email confirmation is required.</div>
                </div>
                {err && <div className="text-red-600 text-sm">{err}</div>}
                <button disabled={loading} className="w-full px-4 py-2 rounded bg-black text-white hover:opacity-90 active:opacity-80 disabled:opacity-60">{loading? 'Creating…':'Create account'}</button>
              </form>
            )}
          </div>
        </div>
        <div className="text-center mt-3">
          <button onClick={()=>history.back()} className="text-sm underline">Back</button>
        </div>
      </div>
    </main>
  );
}
