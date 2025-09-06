import { createClient } from '@supabase/supabase-js';

/**
 * Returns a Supabase client with service role privileges when available.
 * Falls back to the public anon key (read-only) if service role key missing so
 * that routes which only need public reads keep working in production even if
 * SUPABASE_SERVICE_ROLE_KEY was not configured on the host.
 *
 * Diagnostics: We tag the client with metadata (non-enumerable) so API routes
 * can surface which key type was actually used. This helps debug situations
 * where a newly added service key unexpectedly causes permission errors due to
 * pointing at a different project or being misconfigured.
 *
 * Overrides:
 *  - Set SUPABASE_DISABLE_SERVICE=1 to force using anon key even if service is present.
 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const disableService = process.env.SUPABASE_DISABLE_SERVICE === '1';
  const service = disableService ? undefined : process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url) throw new Error('Supabase URL not configured');
  const keyToUse = service || anon;
  if (!keyToUse) throw new Error('No Supabase key available');

  // Best-effort decode of the JWT portion to read the role claim (anon vs service_role)
  let role: string | undefined;
  try {
    const parts = keyToUse.split('.');
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      role = payload.role;
    }
  } catch {
    role = undefined;
  }

  const client = createClient(url, keyToUse, { auth: { persistSession: false } });
  // Attach diagnostic metadata (symbol to avoid accidental collisions)
  interface KeyMeta { usedService: boolean; role?: string; disableService: boolean }
  (client as unknown as { __questlyKeyMeta?: KeyMeta }).__questlyKeyMeta = { usedService: !!service, role, disableService };
  return client;
}
