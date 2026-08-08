do $$ begin
  create type public."ListingSourceTrustStatus" as enum (
    'board_only',
    'pending_review',
    'community_supported',
    'verified',
    'review_hold',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public."ListingSourceResolutionStatus" as enum (
    'unattempted',
    'no_match',
    'exact_match',
    'ambiguous',
    'failed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public."ListingSourceReportReason" as enum (
    'incorrect_unit',
    'unavailable',
    'conflicting_details',
    'broken_link',
    'other'
  );
exception when duplicate_object then null;
end $$;

alter table public."Listing"
  add column if not exists "unit" text;

update public."Listing"
set "unit" = nullif(btrim("providerData" ->> 'addressLine2'), '')
where "unit" is null
  and "providerData" is not null;

create table if not exists public."CatalogListingSource" (
  id text primary key,
  "listingId" text not null references public."Listing"(id) on delete cascade,
  "canonicalUrl" text not null unique,
  "originalUrl" text not null,
  provider text not null,
  "identityFingerprint" text not null,
  "trustStatus" public."ListingSourceTrustStatus" not null default 'board_only',
  "resolutionStatus" public."ListingSourceResolutionStatus" not null default 'unattempted',
  "resolutionEvidence" jsonb,
  "reviewReason" text,
  "resolvedAt" timestamptz,
  "verifiedAt" timestamptz,
  "verifiedByUserId" text references public."User"(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists "CatalogListingSource_listingId_trustStatus_idx"
  on public."CatalogListingSource" ("listingId", "trustStatus");
create index if not exists "CatalogListingSource_identityFingerprint_trustStatus_idx"
  on public."CatalogListingSource" ("identityFingerprint", "trustStatus");
create index if not exists "CatalogListingSource_trustStatus_updatedAt_idx"
  on public."CatalogListingSource" ("trustStatus", "updatedAt");

alter table public."BoardListingSource"
  add column if not exists "catalogSourceId" text;

do $$ begin
  alter table public."BoardListingSource"
    add constraint "BoardListingSource_catalogSourceId_fkey"
    foreign key ("catalogSourceId")
    references public."CatalogListingSource"(id)
    on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists "BoardListingSource_catalogSourceId_createdAt_idx"
  on public."BoardListingSource" ("catalogSourceId", "createdAt");

create table if not exists public."CatalogSourceAttestation" (
  id text primary key,
  "catalogSourceId" text not null references public."CatalogListingSource"(id) on delete cascade,
  "boardId" text not null references public."SearchBoard"(id) on delete cascade,
  "userId" text not null references public."User"(id) on delete cascade,
  "roommateId" text references public."RoommateProfile"(id) on delete set null,
  "openedAt" timestamptz,
  "attestedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  constraint "CatalogSourceAttestation_catalogSourceId_userId_key"
    unique ("catalogSourceId", "userId")
);

create index if not exists "CatalogSourceAttestation_catalogSourceId_boardId_idx"
  on public."CatalogSourceAttestation" ("catalogSourceId", "boardId");
create index if not exists "CatalogSourceAttestation_userId_updatedAt_idx"
  on public."CatalogSourceAttestation" ("userId", "updatedAt");

create table if not exists public."CatalogSourceReport" (
  id text primary key,
  "catalogSourceId" text not null references public."CatalogListingSource"(id) on delete cascade,
  "boardId" text not null references public."SearchBoard"(id) on delete cascade,
  "userId" text not null references public."User"(id) on delete cascade,
  "roommateId" text references public."RoommateProfile"(id) on delete set null,
  reason public."ListingSourceReportReason" not null,
  details text,
  "createdAt" timestamptz not null default now()
);

create index if not exists "CatalogSourceReport_catalogSourceId_createdAt_idx"
  on public."CatalogSourceReport" ("catalogSourceId", "createdAt");
create index if not exists "CatalogSourceReport_boardId_createdAt_idx"
  on public."CatalogSourceReport" ("boardId", "createdAt");
create index if not exists "CatalogSourceReport_userId_createdAt_idx"
  on public."CatalogSourceReport" ("userId", "createdAt");

create table if not exists public."ListingSourceResolutionCache" (
  id text primary key,
  "identityFingerprint" text not null unique,
  query text not null,
  provider text not null,
  status public."ListingSourceResolutionStatus" not null,
  candidates jsonb not null,
  "matchedCanonicalUrl" text,
  "requestId" text,
  "attemptedAt" timestamptz not null default now()
);

create index if not exists "ListingSourceResolutionCache_provider_attemptedAt_idx"
  on public."ListingSourceResolutionCache" (provider, "attemptedAt");
create index if not exists "ListingSourceResolutionCache_status_attemptedAt_idx"
  on public."ListingSourceResolutionCache" (status, "attemptedAt");

create or replace function public.enforce_brave_request_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  request_count integer;
begin
  if lower(new."provider") <> 'brave' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('homeboard:brave:request-limit'));

  select count(*)
    into request_count
    from public."ProviderApiRequest"
   where lower("provider") = 'brave'
     and "requestedAt" >= current_timestamp - interval '32 days';

  if request_count >= 500 then
    raise exception 'Homeboard Brave request limit reached (500 requests in the rolling safety window)'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists "ProviderApiRequest_enforce_brave_limit"
  on public."ProviderApiRequest";

create trigger "ProviderApiRequest_enforce_brave_limit"
before insert on public."ProviderApiRequest"
for each row
execute function public.enforce_brave_request_limit();

create or replace function public.protect_recent_brave_request()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE'
     and lower(old."provider") = 'brave'
     and old."requestedAt" >= current_timestamp - interval '32 days' then
    raise exception 'Recent Brave request ledger entries cannot be deleted'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE'
     and lower(old."provider") = 'brave'
     and (
       new."provider" is distinct from old."provider"
       or new."requestedAt" is distinct from old."requestedAt"
     ) then
    raise exception 'Brave request identity and reservation time are immutable'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists "ProviderApiRequest_protect_recent_brave"
  on public."ProviderApiRequest";

create trigger "ProviderApiRequest_protect_recent_brave"
before update or delete on public."ProviderApiRequest"
for each row
execute function public.protect_recent_brave_request();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'CatalogListingSource',
    'CatalogSourceAttestation',
    'CatalogSourceReport',
    'ListingSourceResolutionCache'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;
