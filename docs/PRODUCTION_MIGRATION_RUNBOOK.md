# Production migration runbook

This runbook is intentionally manual. Run it from the exact release commit that will be deployed. Do not run migrations from a developer branch, and do not use `prisma migrate dev`, `prisma migrate reset`, `prisma db push`, `supabase db reset --linked`, or `--include-seed` against production.

## Scope and expected order

The production rollout has three separate steps:

1. Reconcile the manually created Scout tables with Prisma's migration ledger, then apply the remaining Prisma migrations.
2. Apply the one pending Supabase security migration.
3. Deploy the matching application release, then verify its health and core endpoints.

The production database currently has `20260912170000_advisor_demo_accounts` recorded as applied. The following five migrations are expected to appear as pending before the reconciliation step:

1. `20260905120000_preserve_listing_decisions`
2. `20260909160000_recently_deleted_listings`
3. `20260912000000_homeboard_scout_monetization`
4. `20260912190000_reconcile_scout_schema`
5. `20260912200000_advisor_actions`

Expected Supabase migration:

- `202609090001_lock_down_public_schema.sql`

The four Scout tables already exist in production and contain subscription data, but their original migration is absent from `_prisma_migrations`. Do not let `migrate deploy` attempt to create those tables again. If any status, table, or row-count check differs from this condition, stop and investigate instead of resolving the migration.

## Before the maintenance window

- Record the release commit with `git rev-parse HEAD` and confirm `git status --short` is empty.
- Confirm the release commit contains every migration listed above.
- Confirm a recent production database backup or point-in-time recovery point exists and record its timestamp.
- Export operational counts for users, memberships, boards, board listings, and listing decisions through the approved production administration path. Do not copy credentials or user data into this repository.
- Put writes into a maintenance window if the hosting/database setup cannot guarantee compatible mixed-version traffic.
- Keep the previous application deployment available for immediate traffic rollback.

## Prisma migrations

Set the production `DATABASE_URL` only in the operator's secure shell or secret manager. Never paste it into a command history, document, ticket, or repository file.

Before changing the migration ledger, verify the manually created tables and capture their row counts through the approved SQL console:

```sql
select to_regclass('public."BoardSubscription"') as board_subscription,
       to_regclass('public."BoardSubscriptionContribution"') as subscription_contribution,
       to_regclass('public."ScoutDiscoveredLead"') as scout_lead,
       to_regclass('public."BrokerOutreachRecord"') as broker_outreach;

select (select count(*) from "BoardSubscription") as subscriptions,
       (select count(*) from "BoardSubscriptionContribution") as contributions,
       (select count(*) from "ScoutDiscoveredLead") as leads,
       (select count(*) from "BrokerOutreachRecord") as outreach;
```

From the release checkout:

```sh
npx prisma migrate status
npx prisma migrate resolve --applied 20260912000000_homeboard_scout_monetization
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

The first status command must report exactly the five migrations listed above as pending. Before the resolve command, verify that all four Scout tables exist, that their foreign keys are valid, and record their row counts. `migrate resolve` records the already-created Scout schema without running its `CREATE TABLE` statements. The second status command must then report the other four migrations as pending. The deploy command applies those four, including the schema reconciliation migration. The final status command must report that the database schema is up to date.

Verify through the approved SQL console:

```sql
select migration_name, finished_at, rolled_back_at
from "_prisma_migrations"
where migration_name in (
  '20260905120000_preserve_listing_decisions',
  '20260909160000_recently_deleted_listings',
  '20260912000000_homeboard_scout_monetization',
  '20260912170000_advisor_demo_accounts',
  '20260912190000_reconcile_scout_schema',
  '20260912200000_advisor_actions'
)
order by started_at;

select to_regclass('public."AdvisorAction"') as advisor_action,
       to_regclass('public."ListingSnapshot"') as listing_snapshot,
       to_regclass('public."ListingChange"') as listing_change,
       to_regclass('public."ListingTourNote"') as listing_tour_note,
       to_regclass('public."ListingApplicationItem"') as application_item;

select count(*) as users from "User";
select count(*) as memberships from "BoardMember";
select count(*) as boards from "SearchBoard";
select count(*) as board_listings from "BoardListing";
```

Compare the operational counts with the pre-migration snapshot. These migrations must not delete users, memberships, boards, listings, or decisions.

## Supabase security migration

Use the production project reference from the approved operations record. Linking writes local Supabase CLI metadata; confirm the displayed project before continuing.

```sh
npx --yes supabase@latest link --project-ref <PRODUCTION_PROJECT_REF>
npx --yes supabase@latest db push --dry-run
npx --yes supabase@latest db push
npx --yes supabase@latest db push --dry-run
```

The first dry run must list only `202609090001_lock_down_public_schema.sql`. The final dry run must report that the linked database is up to date. If older migrations are also listed, stop; do not use `--include-all` or repair the migration ledger during the release window.

Verify through the approved SQL console that browser roles have no direct application-table privileges:

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by grantee, table_name, privilege_type;
```

The query should return no grants for those roles. Then confirm the server-side health endpoint still reaches its database and an anonymous Supabase REST request to an application table is denied.

## Application deployment verification

After deploying the exact recorded release commit:

```sh
curl -i https://<PRODUCTION_HOST>/api/health
```

`/api/health` must return JSON with HTTP 200, the expected app/API version, and the deployed commit. Complete an authenticated smoke test with a designated test account: load its existing board, retain cached data through a forced offline launch, and save one complete exact listing in one tap.

## Rollback and failure handling

Application rollback is the first response to an application regression: route traffic to the previous deployment. The Prisma changes are designed to remain compatible with the prior server release, and the security migration affects direct browser-role access rather than the server's database role.

Do not drop the new tables or columns: they may already contain Advisor, inquiry, tour, or checklist data. Do not edit `_prisma_migrations` or `supabase_migrations.schema_migrations` by hand. Do not run either reset command against production.

If a Prisma migration fails:

1. Stop the rollout and preserve the exact error output.
2. Restore the pre-migration backup/PITR point if production data or schema integrity is uncertain.
3. After the database is restored or a reviewed corrective SQL change is applied, use Prisma's supported recovery command for the one failed migration only:

```sh
npx prisma migrate resolve --rolled-back <FAILED_MIGRATION_NAME>
npx prisma migrate status
```

4. Fix the migration in a new reviewed release and repeat the status/deploy/verification sequence.

If the Supabase security migration breaks an approved direct-client path, roll the application back first. Restore the pre-migration database recovery point, or ship a separately reviewed forward security migration containing only the minimum grants required for that path. Never restore broad `public`, `anon`, or `authenticated` access ad hoc during an incident.

Prisma documents `migrate deploy`, `migrate status`, and `migrate resolve` as its production migration/recovery commands: <https://www.prisma.io/docs/orm/reference/prisma-cli-reference>. Supabase documents `link`, `db push`, and `db push --dry-run` in its CLI workflow: <https://supabase.com/docs/guides/local-development/cli-workflows>.
