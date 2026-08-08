CREATE TABLE IF NOT EXISTS public."ProviderApiRequest" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestFingerprint" TEXT,
  "status" TEXT NOT NULL DEFAULT 'reserved',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "httpStatus" INTEGER,
  "resultCount" INTEGER,
  "errorMessage" TEXT,
  CONSTRAINT "ProviderApiRequest_status_check"
    CHECK ("status" IN ('reserved', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS "ProviderApiRequest_provider_requestedAt_idx"
  ON public."ProviderApiRequest" ("provider", "requestedAt");

CREATE INDEX IF NOT EXISTS "ProviderApiRequest_provider_status_requestedAt_idx"
  ON public."ProviderApiRequest" ("provider", "status", "requestedAt");

CREATE OR REPLACE FUNCTION public.enforce_rentcast_request_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  request_count INTEGER;
BEGIN
  IF lower(NEW."provider") <> 'rentcast' THEN
    RETURN NEW;
  END IF;

  -- Serialize quota reservations so concurrent workers cannot both claim slot 50.
  PERFORM pg_advisory_xact_lock(hashtext('homeboard:rentcast:request-limit'));

  SELECT count(*)
    INTO request_count
    FROM public."ProviderApiRequest"
   WHERE lower("provider") = 'rentcast'
     AND "requestedAt" >= CURRENT_TIMESTAMP - INTERVAL '32 days';

  IF request_count >= 50 THEN
    RAISE EXCEPTION 'Homeboard RentCast request limit reached (50 requests in the rolling safety window)'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ProviderApiRequest_enforce_rentcast_limit"
  ON public."ProviderApiRequest";

CREATE TRIGGER "ProviderApiRequest_enforce_rentcast_limit"
BEFORE INSERT ON public."ProviderApiRequest"
FOR EACH ROW
EXECUTE FUNCTION public.enforce_rentcast_request_limit();

CREATE OR REPLACE FUNCTION public.protect_recent_rentcast_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND lower(OLD."provider") = 'rentcast'
     AND OLD."requestedAt" >= CURRENT_TIMESTAMP - INTERVAL '32 days' THEN
    RAISE EXCEPTION 'Recent RentCast request ledger entries cannot be deleted'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'UPDATE'
     AND lower(OLD."provider") = 'rentcast'
     AND (
       NEW."provider" IS DISTINCT FROM OLD."provider"
       OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt"
     ) THEN
    RAISE EXCEPTION 'RentCast request identity and reservation time are immutable'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "ProviderApiRequest_protect_recent_rentcast"
  ON public."ProviderApiRequest";

CREATE TRIGGER "ProviderApiRequest_protect_recent_rentcast"
BEFORE UPDATE OR DELETE ON public."ProviderApiRequest"
FOR EACH ROW
EXECUTE FUNCTION public.protect_recent_rentcast_request();

ALTER TABLE public."ProviderApiRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ProviderApiRequest" FROM anon, authenticated;
