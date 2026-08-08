create table if not exists public."PushDevice" (
  id text primary key,
  "userId" text not null references public."User"(id) on delete cascade,
  token text not null unique,
  platform text not null default 'ios',
  environment text not null default 'development',
  "createdAt" timestamp(3) not null default current_timestamp,
  "updatedAt" timestamp(3) not null default current_timestamp,
  "lastSeenAt" timestamp(3) not null default current_timestamp
);

create index if not exists "PushDevice_userId_lastSeenAt_idx"
  on public."PushDevice" ("userId", "lastSeenAt");

alter table public."PushDevice" enable row level security;
revoke all on table public."PushDevice" from anon, authenticated;
