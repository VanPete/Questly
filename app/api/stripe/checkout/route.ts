import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getAdminClient } from '@/lib/supabaseAdmin';
import { getSupabaseUserIdFromClerk } from '@/lib/authBridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
  const supabase = getAdminClient();
  const uid = await getSupabaseUserIdFromClerk();
    if (!uid) return NextResponse.json({ error: 'auth required' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const priceId = body.priceId || process.env.STRIPE_PRICE_ID;
    if (!priceId) return NextResponse.json({ error: 'missing_price' }, { status: 400 });
    const stripe = getStripe();
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const site = base || '';
    const success_url = `${site}/daily?upgraded=1`;
    const cancel_url = `${site}/upgrade?canceled=1`;

    // Try to reuse existing Stripe customer if present
    let customer: string | undefined;
    const { data: subRow } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('clerk_user_id', uid)
      .maybeSingle();
    if (subRow?.stripe_customer_id) customer = subRow.stripe_customer_id as string;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
  client_reference_id: uid,
      allow_promotion_codes: true,
      customer,
  subscription_data: { metadata: { user_id: uid } },
    });
    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
