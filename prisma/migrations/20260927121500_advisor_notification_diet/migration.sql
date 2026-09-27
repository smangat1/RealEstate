CREATE TABLE "BoardNotificationPreference" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "digestHourLocal" INTEGER NOT NULL DEFAULT 18,
  "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
  "nonCriticalPushEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BoardNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoardNotificationPreference_boardId_userId_key"
ON "BoardNotificationPreference"("boardId", "userId");
CREATE INDEX "BoardNotificationPreference_userId_updatedAt_idx"
ON "BoardNotificationPreference"("userId", "updatedAt");

CREATE TABLE "AdvisorNotificationEvent" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "boardListingId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "urgent" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvisorNotificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdvisorNotificationEvent_fingerprint_key"
ON "AdvisorNotificationEvent"("fingerprint");
CREATE INDEX "AdvisorNotificationEvent_boardId_urgent_createdAt_idx"
ON "AdvisorNotificationEvent"("boardId", "urgent", "createdAt");

CREATE TABLE "AdvisorNotificationDelivery" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "suppressedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdvisorNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdvisorNotificationDelivery_eventId_userId_key"
ON "AdvisorNotificationDelivery"("eventId", "userId");
CREATE INDEX "AdvisorNotificationDelivery_status_leaseUntil_createdAt_idx"
ON "AdvisorNotificationDelivery"("status", "leaseUntil", "createdAt");
CREATE INDEX "AdvisorNotificationDelivery_userId_status_createdAt_idx"
ON "AdvisorNotificationDelivery"("userId", "status", "createdAt");

ALTER TABLE "BoardNotificationPreference" ADD CONSTRAINT "BoardNotificationPreference_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardNotificationPreference" ADD CONSTRAINT "BoardNotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorNotificationEvent" ADD CONSTRAINT "AdvisorNotificationEvent_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorNotificationDelivery" ADD CONSTRAINT "AdvisorNotificationDelivery_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "AdvisorNotificationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorNotificationDelivery" ADD CONSTRAINT "AdvisorNotificationDelivery_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardNotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdvisorNotificationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdvisorNotificationDelivery" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "BoardNotificationPreference" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "AdvisorNotificationEvent" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "AdvisorNotificationDelivery" FROM PUBLIC, anon, authenticated;

-- These records are read and written only by the board-scoped server API and
-- proactive worker. Mobile users never receive direct table access; the API
-- re-checks current board membership before settings reads and every delivery.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "BoardNotificationPreference" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AdvisorNotificationEvent" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AdvisorNotificationDelivery" TO service_role;
