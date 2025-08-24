import Stripe from 'stripe';

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  // Use SDK default apiVersion for the installed stripe package to avoid TS mismatch
  return new Stripe(key);
}
