ALTER TABLE public."Listing"
  ADD COLUMN IF NOT EXISTS "providerData" JSONB,
  ADD COLUMN IF NOT EXISTS "providerStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "providerListedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "providerRemovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "providerLastSeenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "providerFetchedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Listing_sourceName_externalId_key"
  ON public."Listing" ("sourceName", "externalId");
