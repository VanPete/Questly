import { auth } from '@clerk/nextjs/server';

// We now key all application tables directly by Clerk user id (text) instead of a separate Supabase auth user.
// This function simply returns the Clerk user id or null if unauthenticated.
export async function getSupabaseUserIdFromClerk(): Promise<string | null> {
  const { userId } = await auth();
  return userId || null;
}

// Alias retained for clarity / backwards compatibility.
export async function getClerkUserId(): Promise<string | null> {
  return getSupabaseUserIdFromClerk();
}
