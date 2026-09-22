import { randomUUID } from 'node:crypto';

import { after, NextResponse } from 'next/server';

import { notifyBoardChat } from '@/lib/apns';
import { sendOperationalAlert } from '@/lib/monitoring';
import { prisma } from '@/lib/prisma';
import { constructStripeEvent } from '@/lib/stripe';

// Rolling window for the subscription threshold check.
const SUBSCRIPTION_WINDOW_DAYS = 7;
// Amount (in cents) required within the rolling window to activate the subscription.
const SUBSCRIPTION_THRESHOLD_CENTS = 400; // $4.00
// Subscription validity from the moment the threshold is first reached.
const SUBSCRIPTION_DURATION_DAYS = 7;

export const dynamic = 'force-dynamic';

/**
 * Stripe sends the raw request body, which must be consumed as a Buffer/string
 * (not parsed JSON) so that webhook signature verification works.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';

  let event;
  try {
    event = constructStripeEvent(rawBody, signature);
  } catch (error) {
    // Stripe sends this error when the signature is invalid or the secret is wrong.
    const message = error instanceof Error ? error.message : 'Invalid signature';
    return NextResponse.json({ error: `Webhook verification failed: ${message}` }, { status: 400 });
  }

  // We only act on succeeded PaymentIntents. All other event types are ignored.
  if (event.type !== 'payment_intent.succeeded') {
    return NextResponse.json({ received: true });
  }

  const intent = event.data.object;
  const boardId = intent.metadata?.boardId;
  const userId = intent.metadata?.userId;
  const purpose = intent.metadata?.purpose;

  if (!boardId || !userId || purpose !== 'advisor_subscription') {
    // Not an Advisor contribution - skip silently so future webhook types can be added.
    return NextResponse.json({ received: true });
  }

  const amountCents = intent.amount_received ?? intent.amount;

  try {
    // Record the contribution idempotently for Stripe retries.
    const ledgerId = randomUUID();
    const ledger = await prisma.boardWalletLedger.upsert({
      where: { stripePaymentId: intent.id },
      create: {
        id: ledgerId,
        boardId,
        userId,
        amount: amountCents,
        stripePaymentId: intent.id,
      },
      update: {},
    });
    if (ledger.id !== ledgerId) {
      return NextResponse.json({ received: true });
    }

    // Rolling-window total for this board.
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - SUBSCRIPTION_WINDOW_DAYS);

    const aggregate = await prisma.boardWalletLedger.aggregate({
      where: {
        boardId,
        createdAt: { gte: windowStart },
      },
      _sum: { amount: true },
    });

    const windowTotal = aggregate._sum.amount ?? 0;

    if (windowTotal >= SUBSCRIPTION_THRESHOLD_CENTS) {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + SUBSCRIPTION_DURATION_DAYS);

      await prisma.advisorSubscription.upsert({
        where: { boardId },
        create: {
          boardId,
          isActive: true,
          validUntil,
        },
        update: {
          isActive: true,
        },
      });

      // Notify all board members via push.
      after(async () => {
        try {
          await notifyBoardSubscriptionActivated(boardId);
        } catch (pushError) {
          await sendOperationalAlert(pushError, {
            area: 'push',
            operation: 'notify_advisor_subscription_activated',
            severity: 'error',
          });
        }
      });
    }
  } catch (error) {
    await sendOperationalAlert(error, {
      area: 'stripe_webhook',
      operation: 'handle_payment_intent_succeeded',
      severity: 'error',
    });
    // Return 500 so Stripe retries the event.
    return NextResponse.json({ error: 'Internal error processing payment.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function notifyBoardSubscriptionActivated(boardId: string) {
  const board = await prisma.searchBoard.findUnique({
    where: { id: boardId },
    select: {
      title: true,
    },
  });
  if (!board) return;

  await notifyBoardChat({
    boardId,
    authorUserId: '', // system notification - show to everyone
    authorName: 'Homeboard',
    content: `\u2728 Advisor is now active for ${board.title}. Your group has unlocked @advisor for the next 7 days.`,
  }).catch(() => { /* absorb per-recipient failures */ });
}
