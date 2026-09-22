import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ensureBoard } from '@/lib/board-data';
import { requireMobileAppUser } from '@/lib/mobile-auth';
import { sendOperationalAlert } from '@/lib/monitoring';
import { getStripe } from '@/lib/stripe';

// Contribution amount boundaries (cents).
const MIN_CONTRIBUTION_CENTS = 50; // $0.50 - Stripe minimum
const MAX_CONTRIBUTION_CENTS = 10_000; // $100.00 - per-contribution cap

const schema = z.object({
  amountCents: z
    .number()
    .int()
    .min(MIN_CONTRIBUTION_CENTS, `Minimum contribution is $${(MIN_CONTRIBUTION_CENTS / 100).toFixed(2)}.`)
    .max(MAX_CONTRIBUTION_CENTS, `Maximum single contribution is $${(MAX_CONTRIBUTION_CENTS / 100).toFixed(2)}.`),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;

    if (!(await ensureBoard(id, user.id))) {
      return NextResponse.json({ error: 'Board not found.' }, { status: 404 });
    }

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid contribution amount.' },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: parsed.data.amountCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        boardId: id,
        userId: user.id,
        userDisplayName: user.displayName,
        purpose: 'advisor_subscription',
      },
      description: `Homeboard Advisor contribution for board ${id}`,
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents: parsed.data.amountCents,
    });
  } catch (error) {
    await sendOperationalAlert(error, {
      area: 'mobile_api',
      operation: 'create_advisor_payment_intent',
      requestId: request.headers.get('x-homeboard-request-id'),
    });
    const message = error instanceof Error ? error.message : 'Unable to create payment intent.';
    return NextResponse.json(
      { error: message === 'MOBILE_AUTH_REQUIRED' ? 'Unauthorized' : 'Unable to initiate payment.' },
      { status: message === 'MOBILE_AUTH_REQUIRED' ? 401 : 500 },
    );
  }
}
