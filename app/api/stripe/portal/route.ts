import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getClerkUserId } from '@/lib/authBridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
  const supabase = getAdminClient();
  const uid = await getClerkUserId();
    if (!uid) return NextResponse.json({ error: 'auth required' }, { status: 401 });

    // Fetch customer id
    const { data: subRow, error } = await supabase
  .from('user_subscriptions')
  .select('stripe_customer_id')
  .eq('clerk_user_id', uid)
      .maybeSingle();
    if (error) throw error;
    const customer = subRow?.stripe_customer_id as string | undefined;
    if (!customer) return NextResponse.json({ error: 'no_customer' }, { status: 400 });

    const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    const return_url = (base || '') + '/upgrade';
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url,
    });
    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
