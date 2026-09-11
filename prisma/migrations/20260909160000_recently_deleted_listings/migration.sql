ALTER TABLE "BoardListing"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "BoardListing_boardId_deletedAt_idx"
  ON "BoardListing"("boardId", "deletedAt");
