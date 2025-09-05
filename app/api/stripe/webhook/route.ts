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
      case 'checkout.session.completed': {
        const cs = event.data.object as Stripe.Checkout.Session;
        if (cs.mode === 'subscription') {
          const clerk_user_id = typeof cs.client_reference_id === 'string' ? cs.client_reference_id : null;
          const customer = typeof cs.customer === 'string' ? cs.customer : (cs.customer as Stripe.Customer | null)?.id;
      if (clerk_user_id && customer) {
            await supabase.from('user_subscriptions').upsert({
        clerk_user_id,
              plan: 'premium',
              stripe_customer_id: customer,
              status: (cs.status as string) || 'complete',
            });
          }
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        let clerk_user_id = typeof sub.metadata?.user_id === 'string' ? sub.metadata.user_id : null;
        const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer as Stripe.Customer).id;
        if (!clerk_user_id) {
          // Fallback: map via prior checkout session upsert by customer id
          const { data: existing } = await supabase
            .from('user_subscriptions')
            .select('clerk_user_id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          clerk_user_id = (existing as { clerk_user_id?: string } | null)?.clerk_user_id ?? null;
        }
        if (!clerk_user_id) break;
        const status = sub.status;
        const cpe = (sub as unknown as { current_period_end?: number }).current_period_end;
        const period_end = cpe ? new Date(cpe * 1000).toISOString() : null;
        const plan = status === 'active' || status === 'trialing' ? 'premium' : 'free';
        await supabase.from('user_subscriptions').upsert({
          clerk_user_id,
          plan,
          stripe_customer_id: customerId,
          current_period_end: period_end,
          status,
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const clerk_user_id = typeof sub.metadata?.user_id === 'string' ? sub.metadata.user_id : null;
        if (!clerk_user_id) break;
        await supabase.from('user_subscriptions').upsert({ clerk_user_id, plan: 'free', status: 'canceled' });
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
