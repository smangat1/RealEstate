-- The first Scout tables were created manually in production before their
-- Prisma migration was recorded. Normalize both that legacy shape and clean
-- installs to the current Prisma schema without deleting rows.
SET TIME ZONE 'UTC';

ALTER TABLE "BoardSubscription"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "startedAt" TYPE TIMESTAMP(3) USING "startedAt"::TIMESTAMP(3),
  ALTER COLUMN "expiresAt" TYPE TIMESTAMP(3) USING "expiresAt"::TIMESTAMP(3),
  ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::TIMESTAMP(3),
  ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::TIMESTAMP(3),
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "BoardSubscriptionContribution"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "paidAt" TYPE TIMESTAMP(3) USING "paidAt"::TIMESTAMP(3),
  ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::TIMESTAMP(3),
  ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::TIMESTAMP(3),
  ALTER COLUMN "updatedAt" DROP DEFAULT;

UPDATE "ScoutDiscoveredLead"
SET "matchReason" = 'Match reason unavailable.'
WHERE "matchReason" IS NULL;

ALTER TABLE "ScoutDiscoveredLead"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "matchScore" SET DEFAULT 85,
  ALTER COLUMN "matchReason" SET NOT NULL,
  ALTER COLUMN "discoveredAt" TYPE TIMESTAMP(3) USING "discoveredAt"::TIMESTAMP(3),
  ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::TIMESTAMP(3),
  ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::TIMESTAMP(3),
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "BrokerOutreachRecord"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "contactedAt" TYPE TIMESTAMP(3) USING "contactedAt"::TIMESTAMP(3),
  ALTER COLUMN "createdAt" TYPE TIMESTAMP(3) USING "createdAt"::TIMESTAMP(3),
  ALTER COLUMN "updatedAt" TYPE TIMESTAMP(3) USING "updatedAt"::TIMESTAMP(3),
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "BoardSubscription"
  DROP CONSTRAINT IF EXISTS "BoardSubscription_board_fk",
  DROP CONSTRAINT IF EXISTS "BoardSubscription_boardId_fkey",
  ADD CONSTRAINT "BoardSubscription_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardSubscriptionContribution"
  DROP CONSTRAINT IF EXISTS "BoardSubscriptionContribution_sub_fk",
  DROP CONSTRAINT IF EXISTS "BoardSubscriptionContribution_subscriptionId_fkey",
  DROP CONSTRAINT IF EXISTS "BoardSubscriptionContribution_user_fk",
  DROP CONSTRAINT IF EXISTS "BoardSubscriptionContribution_userId_fkey",
  ADD CONSTRAINT "BoardSubscriptionContribution_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "BoardSubscription"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BoardSubscriptionContribution_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScoutDiscoveredLead"
  DROP CONSTRAINT IF EXISTS "ScoutDiscoveredLead_board_fk",
  DROP CONSTRAINT IF EXISTS "ScoutDiscoveredLead_boardId_fkey",
  DROP CONSTRAINT IF EXISTS "ScoutDiscoveredLead_listing_fk",
  DROP CONSTRAINT IF EXISTS "ScoutDiscoveredLead_listingId_fkey",
  DROP CONSTRAINT IF EXISTS "ScoutDiscoveredLead_board_listing_unique",
  ADD CONSTRAINT "ScoutDiscoveredLead_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ScoutDiscoveredLead_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BrokerOutreachRecord"
  DROP CONSTRAINT IF EXISTS "BrokerOutreachRecord_boardListing_fk",
  DROP CONSTRAINT IF EXISTS "BrokerOutreachRecord_boardListingId_fkey",
  DROP CONSTRAINT IF EXISTS "BrokerOutreachRecord_user_fk",
  DROP CONSTRAINT IF EXISTS "BrokerOutreachRecord_userId_fkey",
  ADD CONSTRAINT "BrokerOutreachRecord_boardListingId_fkey"
    FOREIGN KEY ("boardListingId") REFERENCES "BoardListing"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BrokerOutreachRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "BoardSubscription_boardId_status_idx"
  ON "BoardSubscription"("boardId", "status");
CREATE INDEX IF NOT EXISTS "BoardSubscription_expiresAt_idx"
  ON "BoardSubscription"("expiresAt");

DROP INDEX IF EXISTS "BoardSubscriptionContribution_subscriptionId_idx";
CREATE INDEX IF NOT EXISTS "BoardSubscriptionContribution_subscriptionId_status_idx"
  ON "BoardSubscriptionContribution"("subscriptionId", "status");
CREATE INDEX IF NOT EXISTS "BoardSubscriptionContribution_userId_idx"
  ON "BoardSubscriptionContribution"("userId");

CREATE INDEX IF NOT EXISTS "ScoutDiscoveredLead_boardId_status_idx"
  ON "ScoutDiscoveredLead"("boardId", "status");
CREATE INDEX IF NOT EXISTS "ScoutDiscoveredLead_listingId_idx"
  ON "ScoutDiscoveredLead"("listingId");
CREATE UNIQUE INDEX IF NOT EXISTS "ScoutDiscoveredLead_boardId_listingId_key"
  ON "ScoutDiscoveredLead"("boardId", "listingId");

DROP INDEX IF EXISTS "BrokerOutreachRecord_boardListingId_idx";
CREATE INDEX IF NOT EXISTS "BrokerOutreachRecord_userId_idx"
  ON "BrokerOutreachRecord"("userId");
