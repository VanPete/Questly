import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim();
    const password = String(body?.password ?? '');
    if (!/.+@.+\..+/.test(email)) return bad('Valid email required');
    if (password.length < 8) return bad('Password must be at least 8 characters');

    const admin = getAdminClient();
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !created?.user) {
      // Provide friendly duplicate message
      const msg = (error?.message || '').toLowerCase().includes('already registered')
        ? 'Email already registered'
        : 'Could not create user';
      return bad(msg);
    }
    return NextResponse.json({ ok: true, email });
  } catch {
    return bad('Invalid request body');
  }
}
