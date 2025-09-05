import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const usernameRaw = String(body?.username ?? '').trim();
    const password = String(body?.password ?? '');
    const emailRaw = body?.email ? String(body.email).trim() : '';

    const username = usernameRaw;
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      return bad('Username must be 3-24 characters: letters, numbers, underscore');
    }
    if (password.length < 8) return bad('Password must be at least 8 characters');

    const admin = getAdminClient();

    // Ensure username uniqueness (case-insensitive) at app level for a friendly error
    const { data: existing, error: qErr } = await admin
      .from('profiles')
      .select('id, display_name')
      .ilike('display_name', username)
      .maybeSingle();
    if (qErr) return bad('Failed to check username');
    if (existing) return bad('Username is taken');

    // Use provided email or generate an internal alias
    const usedEmail = emailRaw && /.+@.+\..+/.test(emailRaw)
      ? emailRaw
      : `${username}@user.questly.local`;

    // Create user via Admin API with confirmed email to skip email confirmations
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: usedEmail,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (cErr || !created?.user) {
      return bad('Could not create user');
    }

    const userId = created.user.id;
    // Ensure profile exists and set display_name to username
    // The trigger should create a profile row; but upsert in case
    const { error: upErr } = await admin
      .from('profiles')
      .upsert({ id: userId, display_name: username }, { onConflict: 'id' });
    if (upErr) {
      // If unique constraint fails due to race, return friendly error
      return bad('Username is taken');
    }

    return NextResponse.json({ ok: true, email: usedEmail });
  } catch {
    return bad('Invalid request body');
  }
}
