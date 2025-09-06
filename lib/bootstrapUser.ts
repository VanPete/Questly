import { auth, currentUser } from '@clerk/nextjs/server';
import { getAdminClient } from './supabaseAdmin';

/**
 * Idempotently ensures the core per-user rows exist for the signed-in Clerk user.
 * Creates:
 *  - profiles (id only) if missing
 *  - user_points (clerk_user_id only) if missing
 * (Optional future: user_subscriptions default row)
 */
export async function bootstrapCurrentUser() {
  try {
    const { userId } = await auth();
    if (!userId) return; // anonymous
  const clerkUser = await currentUser().catch(() => null);
    const client = getAdminClient();
    // Derive desired display name from Clerk username (never email per requirements)
    let desiredName: string | null = null;
  interface ClerkLite { username?: string | null }
  const raw = (clerkUser as ClerkLite | null)?.username || undefined;
    if (raw) {
      const trimmed = raw.trim();
      if (trimmed) desiredName = trimmed.slice(0, 24); // DB constraint 3–24
      if (desiredName && desiredName.length < 3) desiredName = desiredName.padEnd(3, '_');
    }

    // Fetch existing profile to decide if update needed (avoid unnecessary writes)
    const { data: existingProfile } = await client.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    if (!existingProfile) {
      await client.from('profiles').upsert({ id: userId, display_name: desiredName }, { onConflict: 'id' });
    } else if (desiredName && existingProfile.display_name !== desiredName) {
      await client.from('profiles').update({ display_name: desiredName }).eq('id', userId);
    }

    // Ensure user_points row exists
    await client.from('user_points').upsert({ clerk_user_id: userId }, { onConflict: 'clerk_user_id' });

    // Ensure user_subscriptions row exists (default free)
    await client.from('user_subscriptions').upsert({ clerk_user_id: userId, plan: 'free', status: 'active' }, { onConflict: 'clerk_user_id' });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[bootstrapCurrentUser] failed', e);
    }
  }
}
