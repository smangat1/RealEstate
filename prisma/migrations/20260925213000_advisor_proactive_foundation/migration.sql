ALTER TYPE "AdvisorActionKind" ADD VALUE IF NOT EXISTS 'negotiation_comp';

ALTER TABLE "BrokerOutreachRecord"
ADD COLUMN IF NOT EXISTS "advisorMessageId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "BrokerOutreachRecord_advisorMessageId_key"
ON "BrokerOutreachRecord"("advisorMessageId");

CREATE UNIQUE INDEX IF NOT EXISTS "ListingSnapshot_boardListingId_fingerprint_observedAt_key"
ON "ListingSnapshot"("boardListingId", "fingerprint", "observedAt");

ALTER TABLE "BrokerOutreachRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdvisorAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ListingSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ListingChange" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "BrokerOutreachRecord" FROM anon, authenticated;
REVOKE ALL ON TABLE "AdvisorAction" FROM anon, authenticated;
REVOKE ALL ON TABLE "ListingSnapshot" FROM anon, authenticated;
REVOKE ALL ON TABLE "ListingChange" FROM anon, authenticated;
