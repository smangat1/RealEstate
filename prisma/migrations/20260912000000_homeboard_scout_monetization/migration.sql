-- Homeboard Scout Monetization — Update 1
-- Creates BoardSubscription, BoardSubscriptionContribution, ScoutDiscoveredLead, BrokerOutreachRecord

-- ────────────────────────────────────────────────────────────
-- BoardSubscription
-- ────────────────────────────────────────────────────────────
CREATE TABLE "BoardSubscription" (
    "id"           TEXT         NOT NULL,
    "boardId"      TEXT         NOT NULL,
    "status"       TEXT         NOT NULL DEFAULT 'pending_split',
    "tier"         TEXT         NOT NULL DEFAULT 'scout_weekly',
    "amountCents"  INTEGER      NOT NULL DEFAULT 499,
    "currency"     TEXT         NOT NULL DEFAULT 'usd',
    "startedAt"    TIMESTAMP(3),
    "expiresAt"    TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BoardSubscription_boardId_fkey" FOREIGN KEY ("boardId")
        REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BoardSubscription_boardId_status_idx"
    ON "BoardSubscription"("boardId", "status");
CREATE INDEX "BoardSubscription_expiresAt_idx"
    ON "BoardSubscription"("expiresAt");
-- ────────────────────────────────────────────────────────────
-- BoardSubscriptionContribution
-- ────────────────────────────────────────────────────────────
CREATE TABLE "BoardSubscriptionContribution" (
    "id"             TEXT         NOT NULL,
    "subscriptionId" TEXT         NOT NULL,
    "userId"         TEXT         NOT NULL,
    "amountCents"    INTEGER      NOT NULL,
    "status"         TEXT         NOT NULL DEFAULT 'pledged',
    "paymentMethod"  TEXT,
    "paidAt"         TIMESTAMP(3),
    "transactionId"  TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardSubscriptionContribution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BoardSubscriptionContribution_subscriptionId_fkey" FOREIGN KEY ("subscriptionId")
        REFERENCES "BoardSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BoardSubscriptionContribution_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BoardSubscriptionContribution_subscriptionId_status_idx"
    ON "BoardSubscriptionContribution"("subscriptionId", "status");
CREATE INDEX "BoardSubscriptionContribution_userId_idx"
    ON "BoardSubscriptionContribution"("userId");

-- ────────────────────────────────────────────────────────────
-- ScoutDiscoveredLead
-- ────────────────────────────────────────────────────────────
CREATE TABLE "ScoutDiscoveredLead" (
    "id"           TEXT         NOT NULL,
    "boardId"      TEXT         NOT NULL,
    "listingId"    TEXT         NOT NULL,
    "matchScore"   INTEGER      NOT NULL DEFAULT 85,
    "matchReason"  TEXT         NOT NULL,
    "status"       TEXT         NOT NULL DEFAULT 'pending',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoutDiscoveredLead_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScoutDiscoveredLead_boardId_fkey" FOREIGN KEY ("boardId")
        REFERENCES "SearchBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScoutDiscoveredLead_listingId_fkey" FOREIGN KEY ("listingId")
        REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ScoutDiscoveredLead_boardId_status_idx"
    ON "ScoutDiscoveredLead"("boardId", "status");
CREATE INDEX "ScoutDiscoveredLead_listingId_idx"
    ON "ScoutDiscoveredLead"("listingId");
CREATE UNIQUE INDEX "ScoutDiscoveredLead_boardId_listingId_key"
    ON "ScoutDiscoveredLead"("boardId", "listingId");

-- ────────────────────────────────────────────────────────────
-- BrokerOutreachRecord
-- ────────────────────────────────────────────────────────────
CREATE TABLE "BrokerOutreachRecord" (
    "id"             TEXT         NOT NULL,
    "boardListingId" TEXT         NOT NULL,
    "userId"         TEXT         NOT NULL,
    "contactedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method"         TEXT         NOT NULL DEFAULT 'email',
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerOutreachRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BrokerOutreachRecord_boardListingId_fkey" FOREIGN KEY ("boardListingId")
        REFERENCES "BoardListing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BrokerOutreachRecord_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BrokerOutreachRecord_boardListingId_contactedAt_idx"
    ON "BrokerOutreachRecord"("boardListingId", "contactedAt");
CREATE INDEX "BrokerOutreachRecord_userId_idx"
    ON "BrokerOutreachRecord"("userId");
