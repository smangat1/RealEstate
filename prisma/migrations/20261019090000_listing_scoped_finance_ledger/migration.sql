ALTER TABLE "BoardExpense"
  ADD COLUMN "boardListingId" TEXT,
  ADD COLUMN "splitUserIds" JSONB,
  ADD COLUMN "splitShares" JSONB,
  ADD COLUMN "paidByName" TEXT;

CREATE INDEX "BoardExpense_boardListingId_paidAt_idx"
  ON "BoardExpense"("boardListingId", "paidAt");

ALTER TABLE "BoardExpense" ADD CONSTRAINT "BoardExpense_boardListingId_fkey"
  FOREIGN KEY ("boardListingId") REFERENCES "BoardListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
