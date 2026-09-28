import assert from "node:assert/strict";

import { flushDueAdvisorDigests } from "../lib/advisor-notifications";
import { prisma } from "../lib/prisma";

const prefix = `notification-db-${Date.now()}`;
const now = new Date("2026-09-27T18:17:00.000Z");
const ownerId = `${prefix}-owner`;
const removedId = `${prefix}-removed`;
const quietBoardId = `${prefix}-quiet`;
const dueBoardId = `${prefix}-due`;
const removedBoardId = `${prefix}-removed-board`;

async function main() {
  // A configured provider with no registered device must remain retryable and
  // must not be reported as delivered. The dummy key is never parsed because
  // this fixture intentionally creates no PushDevice rows.
  process.env.APNS_KEY_ID = "integration-key";
  process.env.APNS_TEAM_ID = "integration-team";
  process.env.APNS_PRIVATE_KEY = "integration-private-key";
  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: "Owner" },
      { id: removedId, displayName: "Removed member" },
    ],
  });
  await prisma.searchBoard.createMany({
    data: [
      { id: quietBoardId, userId: ownerId, title: "Quiet board" },
      { id: dueBoardId, userId: ownerId, title: "Due board" },
      { id: removedBoardId, userId: ownerId, title: "Removed-member board" },
    ],
  });
  await prisma.boardNotificationPreference.createMany({
    data: [
      {
        boardId: quietBoardId,
        userId: ownerId,
        digestHourLocal: 18,
        timeZone: "UTC",
        timeZoneSource: "manual",
        nextDigestAt: new Date(now.getTime() + 60 * 60 * 1_000),
      },
      {
        boardId: dueBoardId,
        userId: ownerId,
        digestHourLocal: 18,
        timeZone: "UTC",
        timeZoneSource: "manual",
        nextDigestAt: new Date(now.getTime() - 60 * 1_000),
      },
      {
        boardId: removedBoardId,
        userId: removedId,
        digestHourLocal: 18,
        timeZone: "UTC",
        timeZoneSource: "manual",
        nextDigestAt: new Date(now.getTime() - 60 * 1_000),
      },
    ],
  });

  const quietEvents = Array.from({ length: 1_001 }, (_, index) => ({
    id: `${prefix}-quiet-event-${index}`,
    boardId: quietBoardId,
    type: "listing_change",
    title: "Quiet listing update",
    body: "Saved in the in-app feed.",
    fingerprint: `${prefix}-quiet-fingerprint-${index}`,
    urgent: false,
    createdAt: new Date(now.getTime() - (2_000 - index) * 1_000),
  }));
  await prisma.advisorNotificationEvent.createMany({ data: quietEvents });
  await prisma.advisorNotificationDelivery.createMany({
    data: quietEvents.map((event) => ({ eventId: event.id, userId: ownerId })),
  });
  await prisma.advisorNotificationEvent.create({
    data: {
      id: `${prefix}-due-event`,
      boardId: dueBoardId,
      type: "advisor_follow_up",
      title: "Due update",
      body: "Due beyond the old global delivery cap.",
      fingerprint: `${prefix}-due-fingerprint`,
      urgent: false,
      deliveries: { create: { userId: ownerId } },
    },
  });
  await prisma.advisorNotificationEvent.create({
    data: {
      id: `${prefix}-removed-event`,
      boardId: removedBoardId,
      type: "advisor_follow_up",
      title: "Removed member update",
      body: "Must not be delivered.",
      fingerprint: `${prefix}-removed-fingerprint`,
      urgent: false,
      deliveries: { create: { userId: removedId } },
    },
  });

  const flushResult = await flushDueAdvisorDigests(now);

  const [dueDelivery, removedDelivery, quietPending, preferences] = await Promise.all([
    prisma.advisorNotificationDelivery.findFirstOrThrow({
      where: { eventId: `${prefix}-due-event`, userId: ownerId },
    }),
    prisma.advisorNotificationDelivery.findFirstOrThrow({
      where: { eventId: `${prefix}-removed-event`, userId: removedId },
    }),
    prisma.advisorNotificationDelivery.count({
      where: { event: { boardId: quietBoardId }, status: "pending" },
    }),
    prisma.boardNotificationPreference.findMany({
      where: { userId: ownerId },
      orderBy: { boardId: "asc" },
    }),
  ]);
  assert.equal(dueDelivery.status, "pending");
  assert.equal(
    dueDelivery.deliveryOutcome,
    "no_device",
    `due delivery was not attempted: ${JSON.stringify(flushResult)}`,
  );
  assert.ok(dueDelivery.leaseUntil && dueDelivery.leaseUntil > now);
  assert.equal(removedDelivery.status, "suppressed");
  assert.equal(quietPending, 1_001);
  assert.equal(preferences.length, 2);
  assert.notEqual(preferences[0]?.boardId, preferences[1]?.boardId);

  const attemptCount = dueDelivery.attemptCount;
  await prisma.boardNotificationPreference.update({
    where: { boardId_userId: { boardId: dueBoardId, userId: ownerId } },
    data: { digestLeaseUntil: new Date(now.getTime() + 60 * 60 * 1_000) },
  });
  await flushDueAdvisorDigests(new Date(now.getTime() + 30 * 60 * 1_000));
  const stillLeased = await prisma.advisorNotificationDelivery.findUniqueOrThrow({
    where: { eventId_userId: { eventId: `${prefix}-due-event`, userId: ownerId } },
  });
  assert.equal(stillLeased.attemptCount, attemptCount);
}

main()
  .then(() => {
    process.stdout.write("advisor notification DB integration: passed\n");
  })
  .finally(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, removedId] } } });
    await prisma.$disconnect();
  });
