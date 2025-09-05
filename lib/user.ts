// Deprecated: Supabase client auth has been replaced by Clerk.
// Leave minimal stubs to avoid breaking imports in older code paths.
export type SupaUser = { id: string; email?: string | null } | null;
export function useSupabaseUser(): SupaUser { return null; }
export async function getAccessToken(): Promise<string | null> { return null; }
