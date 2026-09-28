CREATE TYPE "AdvisorPreferenceProposalStatus" AS ENUM ('pending', 'accepted', 'rejected', 'expired');

CREATE TABLE "AdvisorPreferenceProposal" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "roommateId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,
  "status" "AdvisorPreferenceProposalStatus" NOT NULL DEFAULT 'pending',
  "baseProfileUpdatedAt" TIMESTAMP(3) NOT NULL,
  "changes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "AdvisorPreferenceProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdvisorPreferenceProposal_sourceMessageId_key"
ON "AdvisorPreferenceProposal"("sourceMessageId");
CREATE INDEX "AdvisorPreferenceProposal_boardId_userId_status_createdAt_idx"
ON "AdvisorPreferenceProposal"("boardId", "userId", "status", "createdAt");
CREATE INDEX "AdvisorPreferenceProposal_roommateId_status_idx"
ON "AdvisorPreferenceProposal"("roommateId", "status");

ALTER TABLE "AdvisorPreferenceProposal" ADD CONSTRAINT "AdvisorPreferenceProposal_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdvisorPreferenceProposal" ADD CONSTRAINT "AdvisorPreferenceProposal_roommateId_fkey"
  FOREIGN KEY ("roommateId") REFERENCES "RoommateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdvisorPreferenceProposal" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdvisorPreferenceProposal" FROM anon, authenticated;
