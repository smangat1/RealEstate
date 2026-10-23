CREATE TYPE "AdvisorMemberAvailabilityState" AS ENUM ('away', 'ride_along');

CREATE TABLE "AdvisorMemberAvailability" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "state" "AdvisorMemberAvailabilityState" NOT NULL,
  "awayUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdvisorMemberAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdvisorMemberAvailability_boardId_userId_key"
  ON "AdvisorMemberAvailability"("boardId", "userId");
CREATE INDEX "AdvisorMemberAvailability_userId_updatedAt_idx"
  ON "AdvisorMemberAvailability"("userId", "updatedAt");

ALTER TABLE "AdvisorMemberAvailability" ADD CONSTRAINT "AdvisorMemberAvailability_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorMemberAvailability" ADD CONSTRAINT "AdvisorMemberAvailability_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdvisorMemberAvailability" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdvisorMemberAvailability" FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE "AdvisorMemberAvailability" TO service_role;
