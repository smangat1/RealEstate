alter table public."RoommateProfile"
  add column if not exists "commuteAccess" text;

alter table public."RoommateProfile"
  drop constraint if exists "RoommateProfile_commuteAccess_allowed";

alter table public."RoommateProfile"
  add constraint "RoommateProfile_commuteAccess_allowed"
  check (
    "commuteAccess" is null
    or "commuteAccess" in ('car', 'transit', 'flexible', 'remote', 'skip')
  );
