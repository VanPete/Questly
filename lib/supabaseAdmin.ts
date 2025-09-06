import { createClient } from '@supabase/supabase-js';

// Returns a Supabase client with service role privileges when available.
// Falls back to the public anon key (read-only) if service role key missing so
// that routes which only need public reads keep working in production even if
// SUPABASE_SERVICE_ROLE_KEY was not configured on the host.
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url) throw new Error('Supabase URL not configured');
  const keyToUse = service || anon;
  if (!keyToUse) throw new Error('No Supabase key available');
  return createClient(url, keyToUse, { auth: { persistSession: false } });
}
