-- Some production databases received the recoverable-delete column before the
-- Prisma migration ledger was updated. Keep this migration safe for both that
-- existing shape and clean installs, and normalize the stored type to Prisma's
-- UTC timestamp representation without changing the represented instants.
SET TIME ZONE 'UTC';

ALTER TABLE "BoardListing"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "BoardListing"
  ALTER COLUMN "deletedAt" TYPE TIMESTAMP(3)
  USING "deletedAt"::TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "BoardListing_boardId_deletedAt_idx"
  ON "BoardListing"("boardId", "deletedAt");
