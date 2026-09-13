CREATE TYPE "AdvisorActionKind" AS ENUM (
  'fit_summary',
  'listing_change',
  'conflict',
  'inquiry_draft',
  'follow_up_draft',
  'reply_summary',
  'decision_digest',
  'archive_suggestion',
  'tour_note_summary',
  'application_checklist'
);

CREATE TYPE "AdvisorActionStatus" AS ENUM ('open', 'completed', 'dismissed');
CREATE TYPE "AdvisorActionPriority" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "ListingChangeKind" AS ENUM ('price', 'fee', 'availability', 'status');
CREATE TYPE "InquiryStatus" AS ENUM ('drafted', 'sent', 'answered', 'stale');
CREATE TYPE "ApplicationItemStatus" AS ENUM ('missing', 'ready', 'submitted', 'waived');

ALTER TABLE "BrokerOutreachRecord"
  ADD COLUMN "status" "InquiryStatus" NOT NULL DEFAULT 'drafted',
  ADD COLUMN "templateKey" TEXT NOT NULL DEFAULT 'availability',
  ADD COLUMN "subject" TEXT,
  ADD COLUMN "body" TEXT,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "answeredAt" TIMESTAMP(3),
  ADD COLUMN "staleAt" TIMESTAMP(3),
  ADD COLUMN "lastFollowUpAt" TIMESTAMP(3),
  ADD COLUMN "replyText" TEXT,
  ADD COLUMN "replyFacts" JSONB,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "BrokerOutreachRecord"
SET "status" = 'sent',
    "sentAt" = "contactedAt",
    "createdAt" = "contactedAt",
    "updatedAt" = "contactedAt";

ALTER TABLE "BrokerOutreachRecord"
  ALTER COLUMN "contactedAt" DROP NOT NULL,
  ALTER COLUMN "contactedAt" DROP DEFAULT,
  ALTER COLUMN "updatedAt" DROP DEFAULT;

DROP INDEX IF EXISTS "BrokerOutreachRecord_boardListingId_contactedAt_idx";
CREATE INDEX "BrokerOutreachRecord_boardListingId_status_createdAt_idx"
  ON "BrokerOutreachRecord"("boardListingId", "status", "createdAt");

CREATE TABLE "AdvisorAction" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "boardListingId" TEXT,
  "kind" "AdvisorActionKind" NOT NULL,
  "status" "AdvisorActionStatus" NOT NULL DEFAULT 'open',
  "priority" "AdvisorActionPriority" NOT NULL DEFAULT 'medium',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "whyItMatters" TEXT NOT NULL,
  "facts" JSONB NOT NULL,
  "sourceLinks" JSONB NOT NULL,
  "primaryAction" JSONB NOT NULL,
  "secondaryActions" JSONB NOT NULL,
  "engine" TEXT NOT NULL DEFAULT 'deterministic',
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AdvisorAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdvisorAction_fingerprint_key" ON "AdvisorAction"("fingerprint");
CREATE INDEX "AdvisorAction_boardId_status_createdAt_idx" ON "AdvisorAction"("boardId", "status", "createdAt");
CREATE INDEX "AdvisorAction_boardListingId_status_createdAt_idx" ON "AdvisorAction"("boardListingId", "status", "createdAt");

CREATE TABLE "ListingSnapshot" (
  "id" TEXT NOT NULL,
  "boardListingId" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "price" INTEGER,
  "fees" JSONB NOT NULL,
  "availableDate" TIMESTAMP(3),
  "listingStatus" "ListingStatus" NOT NULL,
  "providerStatus" TEXT,
  "sourceFacts" JSONB NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListingSnapshot_boardListingId_fingerprint_observedAt_key" ON "ListingSnapshot"("boardListingId", "fingerprint", "observedAt");
CREATE INDEX "ListingSnapshot_boardListingId_observedAt_idx" ON "ListingSnapshot"("boardListingId", "observedAt");

CREATE TABLE "ListingChange" (
  "id" TEXT NOT NULL,
  "boardListingId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "kind" "ListingChangeKind" NOT NULL,
  "field" TEXT NOT NULL,
  "beforeValue" JSONB NOT NULL,
  "afterValue" JSONB NOT NULL,
  "explanation" TEXT NOT NULL,
  "whyItMatters" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingChange_boardListingId_detectedAt_idx" ON "ListingChange"("boardListingId", "detectedAt");
CREATE INDEX "ListingChange_snapshotId_idx" ON "ListingChange"("snapshotId");
CREATE UNIQUE INDEX "ListingChange_snapshotId_field_key" ON "ListingChange"("snapshotId", "field");

CREATE TABLE "ListingTourNote" (
  "id" TEXT NOT NULL,
  "boardListingId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "transcript" TEXT NOT NULL,
  "pros" JSONB NOT NULL,
  "cons" JSONB NOT NULL,
  "concerns" JSONB NOT NULL,
  "followUps" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingTourNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingTourNote_boardListingId_createdAt_idx" ON "ListingTourNote"("boardListingId", "createdAt");
CREATE INDEX "ListingTourNote_authorUserId_idx" ON "ListingTourNote"("authorUserId");

CREATE TABLE "ListingApplicationItem" (
  "id" TEXT NOT NULL,
  "boardListingId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "detail" TEXT,
  "status" "ApplicationItemStatus" NOT NULL DEFAULT 'missing',
  "assignedUserId" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListingApplicationItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListingApplicationItem_boardListingId_key_key" ON "ListingApplicationItem"("boardListingId", "key");
CREATE INDEX "ListingApplicationItem_boardListingId_status_idx" ON "ListingApplicationItem"("boardListingId", "status");

ALTER TABLE "AdvisorAction" ADD CONSTRAINT "AdvisorAction_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorAction" ADD CONSTRAINT "AdvisorAction_boardListingId_fkey"
  FOREIGN KEY ("boardListingId") REFERENCES "BoardListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingSnapshot" ADD CONSTRAINT "ListingSnapshot_boardListingId_fkey"
  FOREIGN KEY ("boardListingId") REFERENCES "BoardListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingChange" ADD CONSTRAINT "ListingChange_boardListingId_fkey"
  FOREIGN KEY ("boardListingId") REFERENCES "BoardListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingChange" ADD CONSTRAINT "ListingChange_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "ListingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingTourNote" ADD CONSTRAINT "ListingTourNote_boardListingId_fkey"
  FOREIGN KEY ("boardListingId") REFERENCES "BoardListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingApplicationItem" ADD CONSTRAINT "ListingApplicationItem_boardListingId_fkey"
  FOREIGN KEY ("boardListingId") REFERENCES "BoardListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
