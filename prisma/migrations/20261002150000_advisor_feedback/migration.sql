CREATE TYPE "AdvisorFeedbackSubjectType" AS ENUM ('action', 'reply_extraction', 'preference_proposal', 'draft');
CREATE TYPE "AdvisorFeedbackSignal" AS ENUM ('rejected', 'revised', 'confirmed');

CREATE TABLE "AdvisorFeedback" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "boardListingId" TEXT,
  "subjectType" "AdvisorFeedbackSubjectType" NOT NULL,
  "subjectId" TEXT NOT NULL,
  "signal" "AdvisorFeedbackSignal" NOT NULL,
  "reasonCode" TEXT,
  "note" TEXT,
  "engine" TEXT,
  "subjectKind" TEXT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvisorFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdvisorFeedback_userId_subjectType_subjectId_signal_key"
ON "AdvisorFeedback"("userId", "subjectType", "subjectId", "signal");
CREATE INDEX "AdvisorFeedback_boardId_subjectType_createdAt_idx"
ON "AdvisorFeedback"("boardId", "subjectType", "createdAt");
CREATE INDEX "AdvisorFeedback_userId_createdAt_idx"
ON "AdvisorFeedback"("userId", "createdAt");

ALTER TABLE "AdvisorFeedback" ADD CONSTRAINT "AdvisorFeedback_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorFeedback" ADD CONSTRAINT "AdvisorFeedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorFeedback" ADD CONSTRAINT "AdvisorFeedback_boardListingId_fkey"
  FOREIGN KEY ("boardListingId") REFERENCES "BoardListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdvisorFeedback" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdvisorFeedback" FROM anon, authenticated;
