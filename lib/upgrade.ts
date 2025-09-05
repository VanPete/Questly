export function getUpgradeHref(): string {
  return process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || '/upgrade';
}
