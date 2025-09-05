import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabaseAdmin';

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const identifierRaw = String(body?.identifier ?? '').trim();
    if (identifierRaw.length < 3) return bad('Identifier required');

    // If it looks like an email, just return it
    if (/.+@.+\..+/.test(identifierRaw)) {
      return NextResponse.json({ email: identifierRaw });
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('id, display_name')
      .ilike('display_name', identifierRaw)
      .maybeSingle();
    if (error || !data) return bad('User not found', 404);

  // Find auth user email via Admin API by id
  const { data: userById, error: getErr } = await admin.auth.admin.getUserById(data.id);
  if (getErr || !userById?.user?.email) return bad('User not found', 404);
  return NextResponse.json({ email: userById.user.email });
  } catch {
    return bad('Invalid request body');
  }
}
