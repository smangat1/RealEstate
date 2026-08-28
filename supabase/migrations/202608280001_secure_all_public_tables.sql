-- Homeboard reads and writes application data only through authenticated server
-- routes backed by Prisma. No public table should be reachable through PostgREST.
-- Secure every existing table, including Prisma's migration ledger and tables
-- created outside the Supabase migration history.
do $$
declare
  target record;
begin
  for target in
    select namespace.nspname as schema_name, relation.relname as table_name
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
  loop
    execute format(
      'alter table %I.%I enable row level security',
      target.schema_name,
      target.table_name
    );
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Prisma migrations normally run as this migration's database role. Removing
-- the API roles from its defaults keeps future tables private even before a
-- subsequent RLS audit runs.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
