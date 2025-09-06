// Central helper to resolve the canonical site base URL across server contexts.
// Prefers NEXT_PUBLIC_SITE_URL (set in both server & client), then VERCEL_URL
// (which is hostname only in Vercel), finally falls back to localhost. Always
// returns an absolute URL (without trailing slash).
export function getBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  return (envUrl || 'http://localhost:3000').replace(/\/$/, '');
}
