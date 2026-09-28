CREATE TABLE "AdvisorMemberFinancialProfile" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "annualIncomeMin" INTEGER,
    "annualIncomeMax" INTEGER,
    "creditScoreMin" INTEGER,
    "creditScoreMax" INTEGER,
    "disclosureMode" TEXT NOT NULL DEFAULT 'available_on_request',
    "promptCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorMemberFinancialProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdvisorMemberFinancialProfile_boardId_userId_key"
ON "AdvisorMemberFinancialProfile"("boardId", "userId");

CREATE INDEX "AdvisorMemberFinancialProfile_userId_updatedAt_idx"
ON "AdvisorMemberFinancialProfile"("userId", "updatedAt");

ALTER TABLE "AdvisorMemberFinancialProfile"
ADD CONSTRAINT "AdvisorMemberFinancialProfile_boardId_fkey"
FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdvisorMemberFinancialProfile"
ADD CONSTRAINT "AdvisorMemberFinancialProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdvisorMemberFinancialProfile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AdvisorMemberFinancialProfile" FROM anon, authenticated;
