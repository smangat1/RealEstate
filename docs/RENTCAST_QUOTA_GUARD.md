# RentCast quota guard

Homeboard treats the 50-request RentCast allowance as a hard ceiling.

## Guarantees

- The RentCast key is server-only in `RENTCAST_API_KEY`.
- The iOS app and browser clients never receive the key.
- User searches read Homeboard's stored listing catalog and do not call RentCast.
- Every provider request reserves a database ledger slot before network access.
- PostgreSQL serializes reservations and rejects slot 51.
- The safety window is 32 rolling days, which is intentionally stricter than a calendar-month reset.
- Failed requests and timeouts still consume a Homeboard slot.
- Provider calls are never automatically retried.
- Each permitted listing search requests up to 500 records.
- Recent RentCast ledger entries cannot be deleted or moved outside the safety window.

These guarantees apply to calls made by Homeboard. Keep the dedicated key out of
other scripts, API clients, and dashboards because calls made outside Homeboard
cannot pass through its database guard.

## Required deployment step

Apply `supabase/migrations/202607220002_rentcast_request_guard.sql` before setting
`RENTCAST_API_KEY`. The integration fails closed if it cannot reserve a database
slot, so a missing ledger table will prevent provider calls rather than bypassing
the limit.

## Operational policy

Only an operator-controlled import job may instantiate the RentCast client.
Interactive filters, map movement, opening a board, and refreshing the iOS UI
must query the Homeboard database only.
