-- Homeboard Scout Monetization — Update 1
-- Creates BoardSubscription, BoardSubscriptionContribution, ScoutDiscoveredLead, BrokerOutreachRecord

-- ────────────────────────────────────────────────────────────
-- BoardSubscription
-- ────────────────────────────────────────────────────────────
CREATE TABLE "BoardSubscription" (
    "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "boardId"      TEXT         NOT NULL,
    "status"       TEXT         NOT NULL DEFAULT 'pending_split',
    "tier"         TEXT         NOT NULL DEFAULT 'scout_weekly',
    "amountCents"  INTEGER      NOT NULL DEFAULT 499,
    "currency"     TEXT         NOT NULL DEFAULT 'usd',
    "startedAt"    TIMESTAMPTZ,
    "expiresAt"    TIMESTAMPTZ,
    "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updatedAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "BoardSubscription_pkey"    PRIMARY KEY ("id"),
    CONSTRAINT "BoardSubscription_board_fk" FOREIGN KEY ("boardId")
        REFERENCES "SearchBoard"("id") ON DELETE CASCADE
);

CREATE INDEX "BoardSubscription_boardId_status_idx"
    ON "BoardSubscription"("boardId", "status");
CREATE INDEX "BoardSubscription_expiresAt_idx"
    ON "BoardSubscription"("expiresAt");

-- ────────────────────────────────────────────────────────────
-- BoardSubscriptionContribution
-- ────────────────────────────────────────────────────────────
CREATE TABLE "BoardSubscriptionContribution" (
    "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "subscriptionId" TEXT         NOT NULL,
    "userId"         TEXT         NOT NULL,
    "amountCents"    INTEGER      NOT NULL,
    "status"         TEXT         NOT NULL DEFAULT 'pledged',
    "paymentMethod"  TEXT,
    "paidAt"         TIMESTAMPTZ,
    "transactionId"  TEXT,
    "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "BoardSubscriptionContribution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BoardSubscriptionContribution_sub_fk" FOREIGN KEY ("subscriptionId")
        REFERENCES "BoardSubscription"("id") ON DELETE CASCADE,
    CONSTRAINT "BoardSubscriptionContribution_user_fk" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "BoardSubscriptionContribution_subscriptionId_idx"
    ON "BoardSubscriptionContribution"("subscriptionId");
CREATE INDEX "BoardSubscriptionContribution_userId_idx"
    ON "BoardSubscriptionContribution"("userId");

-- ────────────────────────────────────────────────────────────
-- ScoutDiscoveredLead
-- ────────────────────────────────────────────────────────────
CREATE TABLE "ScoutDiscoveredLead" (
    "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "boardId"      TEXT         NOT NULL,
    "listingId"    TEXT         NOT NULL,
    "matchScore"   INTEGER      NOT NULL DEFAULT 75,
    "matchReason"  TEXT,
    "status"       TEXT         NOT NULL DEFAULT 'pending',
    "discoveredAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updatedAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "ScoutDiscoveredLead_pkey"   PRIMARY KEY ("id"),
    CONSTRAINT "ScoutDiscoveredLead_board_listing_unique" UNIQUE ("boardId", "listingId"),
    CONSTRAINT "ScoutDiscoveredLead_board_fk" FOREIGN KEY ("boardId")
        REFERENCES "SearchBoard"("id") ON DELETE CASCADE,
    CONSTRAINT "ScoutDiscoveredLead_listing_fk" FOREIGN KEY ("listingId")
        REFERENCES "Listing"("id") ON DELETE CASCADE
);

CREATE INDEX "ScoutDiscoveredLead_boardId_status_idx"
    ON "ScoutDiscoveredLead"("boardId", "status");

-- ────────────────────────────────────────────────────────────
-- BrokerOutreachRecord
-- ────────────────────────────────────────────────────────────
CREATE TABLE "BrokerOutreachRecord" (
    "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "boardListingId" TEXT         NOT NULL,
    "userId"         TEXT         NOT NULL,
    "contactedAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "method"         TEXT         NOT NULL DEFAULT 'email',
    "notes"          TEXT,
    "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT "BrokerOutreachRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BrokerOutreachRecord_boardListing_fk" FOREIGN KEY ("boardListingId")
        REFERENCES "BoardListing"("id") ON DELETE CASCADE,
    CONSTRAINT "BrokerOutreachRecord_user_fk" FOREIGN KEY ("userId")
        REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "BrokerOutreachRecord_boardListingId_idx"
    ON "BrokerOutreachRecord"("boardListingId");
CREATE INDEX "BrokerOutreachRecord_userId_idx"
    ON "BrokerOutreachRecord"("userId");
