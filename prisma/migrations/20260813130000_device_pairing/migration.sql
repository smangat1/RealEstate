CREATE TYPE "DevicePairingStatus" AS ENUM (
  'pending',
  'approving',
  'approved',
  'completed',
  'expired',
  'cancelled'
);

CREATE TABLE "DevicePairing" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "deviceName" TEXT NOT NULL,
  "clientSecretHash" TEXT NOT NULL,
  "approvalCodeHash" TEXT NOT NULL,
  "requestFingerprint" TEXT,
  "status" "DevicePairingStatus" NOT NULL DEFAULT 'pending',
  "approvalAttempts" INTEGER NOT NULL DEFAULT 0,
  "tokenHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "DevicePairing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DevicePairing_clientSecretHash_key"
  ON "DevicePairing"("clientSecretHash");
CREATE INDEX "DevicePairing_status_expiresAt_idx"
  ON "DevicePairing"("status", "expiresAt");
CREATE INDEX "DevicePairing_userId_createdAt_idx"
  ON "DevicePairing"("userId", "createdAt");
CREATE INDEX "DevicePairing_requestFingerprint_createdAt_idx"
  ON "DevicePairing"("requestFingerprint", "createdAt");

ALTER TABLE "DevicePairing"
  ADD CONSTRAINT "DevicePairing_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
