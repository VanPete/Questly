import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { getAdminClient } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const sig = (await headers()).get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  const buf = await request.arrayBuffer();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: 'no_api_key' }, { status: 500 });
  const stripe = new Stripe(key);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(Buffer.from(buf), sig, secret);
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const user_id = typeof sub.metadata?.user_id === 'string' ? sub.metadata.user_id : null;
        if (!user_id) break;
        const status = sub.status;
        const cpe = (sub as unknown as { current_period_end?: number }).current_period_end;
        const period_end = cpe ? new Date(cpe * 1000).toISOString() : null;
        const plan = status === 'active' || status === 'trialing' ? 'premium' : 'free';
        await supabase.from('user_subscriptions').upsert({
          user_id,
          plan,
          stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : (sub.customer as Stripe.Customer).id,
          current_period_end: period_end,
          status,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const user_id = typeof sub.metadata?.user_id === 'string' ? sub.metadata.user_id : null;
        if (!user_id) break;
        await supabase.from('user_subscriptions').upsert({ user_id, plan: 'free', status: 'canceled' });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
