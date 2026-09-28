ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'reported_sent';
ALTER TYPE "BoardListingStatus" ADD VALUE IF NOT EXISTS 'outreach_reported';

ALTER TABLE "AdvisorSubscription"
ADD COLUMN "proactiveCheckedAt" TIMESTAMP(3),
ADD COLUMN "proactiveLeaseUntil" TIMESTAMP(3);

CREATE INDEX "AdvisorSubscription_validUntil_proactiveCheckedAt_idx"
ON "AdvisorSubscription"("validUntil", "proactiveCheckedAt");

CREATE INDEX "AdvisorSubscription_proactiveLeaseUntil_idx"
ON "AdvisorSubscription"("proactiveLeaseUntil");
