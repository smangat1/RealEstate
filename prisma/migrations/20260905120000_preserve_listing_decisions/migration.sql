ALTER TABLE "BoardListingDecision"
  DROP CONSTRAINT "BoardListingDecision_createdByRoommateId_fkey";

ALTER TABLE "BoardListingDecision"
  ALTER COLUMN "createdByRoommateId" DROP NOT NULL;

ALTER TABLE "BoardListingDecision"
  ADD CONSTRAINT "BoardListingDecision_createdByRoommateId_fkey"
  FOREIGN KEY ("createdByRoommateId") REFERENCES "RoommateProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
