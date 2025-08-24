'use client';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  return (
    <main className="max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-3">Sign in</h2>
      <div className="rounded-2xl border p-4">
        <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={["google"]} />
      </div>
    </main>
  );
}
