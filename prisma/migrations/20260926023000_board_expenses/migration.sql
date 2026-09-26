CREATE TABLE "BoardExpense" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "paidByUserId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoardExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardExpense_boardId_paidAt_idx" ON "BoardExpense"("boardId", "paidAt");
CREATE INDEX "BoardExpense_paidByUserId_idx" ON "BoardExpense"("paidByUserId");

ALTER TABLE "BoardExpense" ADD CONSTRAINT "BoardExpense_boardId_fkey"
  FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardExpense" ADD CONSTRAINT "BoardExpense_paidByUserId_fkey"
  FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoardExpense" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "BoardExpense" FROM anon, authenticated;
