import 'server-only';

import Stripe from 'stripe';

const globalForStripe = globalThis as typeof globalThis & {
  __homeboardStripe__?: Stripe;
};

function buildStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
  return new Stripe(key);
}

export function getStripe(): Stripe {
  if (!globalForStripe.__homeboardStripe__) {
    globalForStripe.__homeboardStripe__ = buildStripe();
  }
  return globalForStripe.__homeboardStripe__;
}

export function constructStripeEvent(rawBody: string | Buffer, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
