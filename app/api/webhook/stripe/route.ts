import { randomUUID } from 'node:crypto';

import { after, NextResponse } from 'next/server';

import { notifyBoardChat } from '@/lib/apns';
import {
  applyAdvisorContribution,
  realAdvisorLedgerWhere,
} from '@/lib/advisor-wallet';
import { sendOperationalAlert } from '@/lib/monitoring';
import { prisma } from '@/lib/prisma';
import { constructStripeEvent } from '@/lib/stripe';

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
    const result = await applyAdvisorContribution({
      boardId,
      userId,
      amountCents,
      paymentId: intent.id,
      testMode: false,
      now: new Date(),
    }, {
      recordLedger: async (contribution) => {
        const ledgerId = randomUUID();
        const ledger = await prisma.boardWalletLedger.upsert({
          where: { stripePaymentId: contribution.paymentId },
          create: {
            id: ledgerId,
            boardId: contribution.boardId,
            userId: contribution.userId,
            amount: contribution.amountCents,
            stripePaymentId: contribution.paymentId,
          },
          update: {},
        });
        return ledger.id === ledgerId;
      },
      getRealRollingTotal: async (targetBoardId, windowStart) => {
        const aggregate = await prisma.boardWalletLedger.aggregate({
          where: realAdvisorLedgerWhere(targetBoardId, windowStart),
          _sum: { amount: true },
        });
        return aggregate._sum.amount ?? 0;
      },
      upsertSubscription: async (targetBoardId, validUntil) => {
        await prisma.advisorSubscription.upsert({
          where: { boardId: targetBoardId },
          create: { boardId: targetBoardId, isActive: true, validUntil },
          update: { isActive: true, validUntil },
        });
      },
    });

    if (result.activated) {
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
