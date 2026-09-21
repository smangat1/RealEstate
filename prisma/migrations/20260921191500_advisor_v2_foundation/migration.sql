-- AlterEnum
ALTER TYPE "BoardListingStatus" ADD VALUE 'outreach_sent';

-- CreateTable
CREATE TABLE "BoardWalletLedger" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "stripePaymentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardWalletLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorSubscription" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorMessagePayload" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorMessagePayload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardWalletLedger_boardId_idx" ON "BoardWalletLedger"("boardId");

-- CreateIndex
CREATE INDEX "BoardWalletLedger_userId_idx" ON "BoardWalletLedger"("userId");

-- CreateIndex
CREATE INDEX "BoardWalletLedger_stripePaymentId_idx" ON "BoardWalletLedger"("stripePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorSubscription_boardId_key" ON "AdvisorSubscription"("boardId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorMessagePayload_messageId_key" ON "AdvisorMessagePayload"("messageId");

-- AddForeignKey
ALTER TABLE "BoardWalletLedger" ADD CONSTRAINT "BoardWalletLedger_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardWalletLedger" ADD CONSTRAINT "BoardWalletLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorSubscription" ADD CONSTRAINT "AdvisorSubscription_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorMessagePayload" ADD CONSTRAINT "AdvisorMessagePayload_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
