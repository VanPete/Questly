import { getAdminClient } from './supabaseAdmin';

type AdminUser = { id: string; email?: string | null };
type AdminGetUserByEmailResp = { data?: { user?: AdminUser } | null; error?: { message: string } | null };
type AdminListUsersResp = { data?: { users?: AdminUser[] } | null };
type AdminClient = {
  auth: {
    admin: {
      getUserByEmail?: (email: string) => Promise<AdminGetUserByEmailResp>;
      listUsers?: () => Promise<AdminListUsersResp>;
      createUser: (payload: { email: string; email_confirm: boolean }) => Promise<{ data?: { user?: AdminUser } | null; error?: { message: string } | null }>;
    }
  }
};

// Map a Clerk user (by email) to a Supabase auth user id (uuid).
// If the user doesn't exist in Supabase, create them (email confirmed) and return the new id.
export async function getOrCreateSupabaseUserIdByEmail(email: string): Promise<string | null> {
  const admin = getAdminClient();
  const safeEmail = String(email || '').trim().toLowerCase();
  if (!safeEmail) return null;
  try {
    // Try admin.getUserByEmail if available (supabase-js v2+)
    const a = admin as unknown as AdminClient;
    if (a?.auth?.admin?.getUserByEmail) {
      const { data: found, error: findErr } = await a.auth.admin.getUserByEmail(safeEmail);
      if (!findErr && found?.user?.id) return found.user.id;
    } else if (a?.auth?.admin?.listUsers) {
      // Fallback: list users and filter by email (may be paginated; check first page)
      const { data } = await a.auth.admin.listUsers();
      const match = (data?.users || []).find((u) => (u.email || '').toLowerCase() === safeEmail);
      if (match?.id) return match.id;
    }
  } catch {
    // ignore and try create
  }

  try {
    const { data: created, error } = await (admin as unknown as AdminClient).auth.admin.createUser({
      email: safeEmail,
      email_confirm: true,
    });
    if (error) {
      // If email already exists, try to fetch again (race condition)
      try {
        const a = admin as unknown as AdminClient;
        if (a?.auth?.admin?.getUserByEmail) {
          const { data: found } = await a.auth.admin.getUserByEmail(safeEmail);
          if (found?.user?.id) return found.user.id;
        }
      } catch {}
      return null;
    }
    return created?.user?.id ?? null;
  } catch {
    return null;
  }
}
