import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { getServerClient } from '@/lib/supabaseServer';

export async function POST(request: Request) {
  try {
    const supabase = await getServerClient();
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return NextResponse.json({ error: 'auth required' }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const priceId = body.priceId || process.env.STRIPE_PRICE_ID;
    if (!priceId) return NextResponse.json({ error: 'missing_price' }, { status: 400 });
    const stripe = getStripe();
    const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    const site = base || '';
    const success_url = `${site}/daily?upgraded=1`;
    const cancel_url = `${site}/upgrade?canceled=1`;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url,
      cancel_url,
      client_reference_id: uid,
      subscription_data: { metadata: { user_id: uid } },
    });
    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
