import { auth, currentUser } from '@clerk/nextjs/server';
import { getOrCreateSupabaseUserIdByEmail } from './identityBridge';

// Returns the Supabase auth.users UUID corresponding to the current Clerk user, or null if signed out or unmappable.
export async function getSupabaseUserIdFromClerk(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  try {
    const u = await currentUser();
    const email = (u?.primaryEmailAddress?.emailAddress || u?.emailAddresses?.[0]?.emailAddress || '').toLowerCase();
    if (!email) return null;
    return await getOrCreateSupabaseUserIdByEmail(email);
  } catch {
    return null;
  }
}

// Returns the Clerk userId for the current session, or null if signed out.
export async function getClerkUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId || null;
}
