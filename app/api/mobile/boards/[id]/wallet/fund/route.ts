import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ensureBoard } from '@/lib/board-data';
import { hasAdvisorTestAccess } from '@/lib/advisor-test-access';
import { requireMobileAppUser } from '@/lib/mobile-auth';
import { sendOperationalAlert } from '@/lib/monitoring';
import { prisma } from '@/lib/prisma';
import { getStripe } from '@/lib/stripe';

const ADVISOR_WEEK_CENTS = 400;
const ROLLING_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const MIN_CONTRIBUTION_CENTS = 50;

const schema = z.object({
  amountCents: z
    .number()
    .int()
    .min(MIN_CONTRIBUTION_CENTS, `Minimum contribution is $${(MIN_CONTRIBUTION_CENTS / 100).toFixed(2)}.`)
    .max(ADVISOR_WEEK_CENTS, 'A board week costs $4.00.')
    .multipleOf(MIN_CONTRIBUTION_CENTS, 'Contributions must be in $0.50 increments.'),
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

    const now = new Date();
    const testMode = hasAdvisorTestAccess(user);
    const windowStart = new Date(now.getTime() - ROLLING_WINDOW_MS);
    const [subscription, ledger] = await Promise.all([
      prisma.advisorSubscription.findUnique({
        where: { boardId: id },
        select: { validUntil: true },
      }),
      prisma.boardWalletLedger.aggregate({
        where: { boardId: id, createdAt: { gte: windowStart } },
        _sum: { amount: true },
      }),
    ]);

    if (!testMode && subscription?.validUntil && subscription.validUntil >= now) {
      return NextResponse.json(
        { error: 'Advisor is already active for this board.' },
        { status: 409 },
      );
    }

    const rollingTotalCents = ledger._sum.amount ?? 0;
    const remainingCents = Math.max(0, ADVISOR_WEEK_CENTS - rollingTotalCents);
    if (remainingCents === 0) {
      return NextResponse.json(
        { error: 'This board week is already fully funded.' },
        { status: 409 },
      );
    }
    if (parsed.data.amountCents > remainingCents) {
      return NextResponse.json(
        { error: `Only $${(remainingCents / 100).toFixed(2)} remains for this board week.` },
        { status: 400 },
      );
    }

    if (testMode) {
      const simulatedPaymentId = `advisor_test_${randomUUID()}`;
      await prisma.boardWalletLedger.create({
        data: {
          boardId: id,
          userId: user.id,
          amount: parsed.data.amountCents,
          stripePaymentId: simulatedPaymentId,
        },
      });

      const nextTotalCents = rollingTotalCents + parsed.data.amountCents;
      if (nextTotalCents >= ADVISOR_WEEK_CENTS) {
        const validUntil = new Date(now.getTime() + ROLLING_WINDOW_MS);
        await prisma.advisorSubscription.upsert({
          where: { boardId: id },
          create: { boardId: id, isActive: true, validUntil },
          update: { isActive: true, validUntil },
        });
      }

      return NextResponse.json({
        clientSecret: null,
        paymentIntentId: simulatedPaymentId,
        amountCents: parsed.data.amountCents,
        simulated: true,
      });
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
      simulated: false,
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
