import { auth } from '@clerk/nextjs/server';
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
    const client = getAdminClient();
    // Upsert profile (just id) if missing
    await client.from('profiles').upsert({ id: userId }, { onConflict: 'id' });
    // Upsert user_points row if missing
    await client.from('user_points').upsert({ clerk_user_id: userId }, { onConflict: 'clerk_user_id' });
  } catch (e) {
    // Swallow silently in production; avoid breaking layout render
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[bootstrapCurrentUser] failed', e);
    }
  }
}
