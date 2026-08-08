create table if not exists public."BoardListingRating" (
  id text primary key,
  "boardListingId" text not null references public."BoardListing"(id) on delete cascade,
  "roommateId" text not null references public."RoommateProfile"(id) on delete cascade,
  ratings jsonb not null,
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  constraint "BoardListingRating_boardListingId_roommateId_key" unique ("boardListingId", "roommateId")
);

create index if not exists "BoardListingRating_boardListingId_updatedAt_idx"
  on public."BoardListingRating" ("boardListingId", "updatedAt");

alter table public."BoardListingRating" enable row level security;
revoke all on table public."BoardListingRating" from anon, authenticated;
