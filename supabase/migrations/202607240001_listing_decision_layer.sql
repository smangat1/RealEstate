do $$ begin
  create type public."ListingWorkflowStatus" as enum (
    'suggested', 'source_confirmed', 'considering', 'shortlisted',
    'viewing', 'applying', 'decided'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public."ListingVerificationStatus" as enum (
    'unverified', 'active', 'unavailable', 'possibly_stale', 'incorrect_match'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public."ListingSourceKind" as enum (
    'imported_exact', 'confirmed_exact', 'member_reference'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public."TourIntent" as enum ('yes', 'maybe', 'no');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public."NaturalLightRating" as enum (
    'unknown', 'poor', 'fair', 'good', 'excellent'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public."ListingDecisionType" as enum (
    'shortlist', 'request_viewing', 'apply'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public."ListingDecisionChoice" as enum ('yes', 'no', 'abstain');
exception when duplicate_object then null;
end $$;

alter table public."BoardListing"
  add column if not exists "workflowStatus" public."ListingWorkflowStatus" not null default 'suggested';

update public."BoardListing"
set "workflowStatus" = case "userStatus"::text
  when 'interested' then 'considering'::public."ListingWorkflowStatus"
  when 'maybe' then 'considering'::public."ListingWorkflowStatus"
  when 'toured' then 'viewing'::public."ListingWorkflowStatus"
  when 'applied' then 'applying'::public."ListingWorkflowStatus"
  else 'suggested'::public."ListingWorkflowStatus"
end;

create index if not exists "BoardListing_boardId_workflowStatus_idx"
  on public."BoardListing" ("boardId", "workflowStatus");

alter table public."RoommateProfile"
  add column if not exists "idealBudget" integer,
  add column if not exists "preferredCommuteMinutes" integer,
  add column if not exists "petsRequired" boolean,
  add column if not exists "accessibilityNeeds" text;

alter table public."RoommateProfile"
  drop constraint if exists "RoommateProfile_idealBudget_nonnegative",
  add constraint "RoommateProfile_idealBudget_nonnegative"
    check ("idealBudget" is null or "idealBudget" >= 0),
  drop constraint if exists "RoommateProfile_preferredCommuteMinutes_range",
  add constraint "RoommateProfile_preferredCommuteMinutes_range"
    check (
      "preferredCommuteMinutes" is null
      or ("preferredCommuteMinutes" between 1 and 300)
    ),
  drop constraint if exists "RoommateProfile_preferred_commute_order",
  add constraint "RoommateProfile_preferred_commute_order"
    check (
      "preferredCommuteMinutes" is null
      or "maxCommuteMinutes" is null
      or "preferredCommuteMinutes" <= "maxCommuteMinutes"
    ),
  drop constraint if exists "RoommateProfile_ideal_budget_order",
  add constraint "RoommateProfile_ideal_budget_order"
    check (
      ("budgetMin" is null or "idealBudget" is null or "budgetMin" <= "idealBudget")
      and ("idealBudget" is null or "budgetMax" is null or "idealBudget" <= "budgetMax")
    );

create table if not exists public."BoardListingSource" (
  id text primary key,
  "boardListingId" text not null references public."BoardListing"(id) on delete cascade,
  url text not null,
  label text not null,
  kind public."ListingSourceKind" not null,
  "createdByRoommateId" text references public."RoommateProfile"(id) on delete set null,
  "confirmedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  constraint "BoardListingSource_boardListingId_url_key" unique ("boardListingId", url)
);

create index if not exists "BoardListingSource_boardListingId_createdAt_idx"
  on public."BoardListingSource" ("boardListingId", "createdAt");
create index if not exists "BoardListingSource_createdByRoommateId_idx"
  on public."BoardListingSource" ("createdByRoommateId");

create table if not exists public."BoardListingVerification" (
  id text primary key,
  "boardListingId" text not null references public."BoardListing"(id) on delete cascade,
  "roommateId" text references public."RoommateProfile"(id) on delete set null,
  status public."ListingVerificationStatus" not null,
  note text,
  "createdAt" timestamptz not null default now()
);

create index if not exists "BoardListingVerification_boardListingId_createdAt_idx"
  on public."BoardListingVerification" ("boardListingId", "createdAt");
create index if not exists "BoardListingVerification_roommateId_idx"
  on public."BoardListingVerification" ("roommateId");

create table if not exists public."BoardListingReview" (
  id text primary key,
  "boardListingId" text not null references public."BoardListing"(id) on delete cascade,
  "roommateId" text not null references public."RoommateProfile"(id) on delete cascade,
  "tourIntent" public."TourIntent" not null,
  "interiorAppeal" integer,
  "naturalLight" public."NaturalLightRating" not null default 'unknown',
  "mainConcern" text,
  "sourceViewedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null,
  constraint "BoardListingReview_boardListingId_roommateId_key"
    unique ("boardListingId", "roommateId"),
  constraint "BoardListingReview_interiorAppeal_range"
    check ("interiorAppeal" is null or "interiorAppeal" between 1 and 5)
);

create index if not exists "BoardListingReview_boardListingId_updatedAt_idx"
  on public."BoardListingReview" ("boardListingId", "updatedAt");
create index if not exists "BoardListingReview_roommateId_idx"
  on public."BoardListingReview" ("roommateId");

create table if not exists public."BoardListingDecision" (
  id text primary key,
  "boardListingId" text not null references public."BoardListing"(id) on delete cascade,
  type public."ListingDecisionType" not null,
  "createdByRoommateId" text not null references public."RoommateProfile"(id) on delete cascade,
  "createdAt" timestamptz not null default now(),
  "closedAt" timestamptz
);

create index if not exists "BoardListingDecision_boardListingId_createdAt_idx"
  on public."BoardListingDecision" ("boardListingId", "createdAt");
create index if not exists "BoardListingDecision_createdByRoommateId_idx"
  on public."BoardListingDecision" ("createdByRoommateId");

create table if not exists public."BoardListingDecisionVote" (
  id text primary key,
  "decisionId" text not null references public."BoardListingDecision"(id) on delete cascade,
  "roommateId" text not null references public."RoommateProfile"(id) on delete cascade,
  choice public."ListingDecisionChoice" not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null,
  constraint "BoardListingDecisionVote_decisionId_roommateId_key"
    unique ("decisionId", "roommateId")
);

create index if not exists "BoardListingDecisionVote_roommateId_idx"
  on public."BoardListingDecisionVote" ("roommateId");

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'BoardListingSource',
    'BoardListingVerification',
    'BoardListingReview',
    'BoardListingDecision',
    'BoardListingDecisionVote'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;
