-- Homeboard uses authenticated Next.js APIs backed by Prisma/service credentials.
-- Block direct PostgREST access from anon/authenticated roles so board membership
-- checks cannot be bypassed by calling Supabase tables directly.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'User', 'SearchBoard', 'BoardMember', 'BoardInvitation', 'SearchProfile',
    'Listing', 'BoardListing', 'PriceHistory', 'ChatMessage', 'RoommateProfile',
    'BoardListingVote', 'BoardListingComment', 'BoardEvent', 'AnalyticsEvent'
  ] loop
    if to_regclass('public.' || quote_ident(table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon, authenticated', table_name);
    end if;
  end loop;
end $$;

revoke all on all sequences in schema public from anon, authenticated;
