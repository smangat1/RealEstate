# Advisor feedback signals

`AdvisorFeedback` records board-scoped, member-authored signals for Advisor output. It stores identifiers and the small structured facts shown to the member, never full broker messages, screenshots, or financial data. The unique member/subject/signal key makes repeated taps idempotent. Direct Supabase roles cannot access the table; mobile writes go through the authenticated service route and board-membership checks.

Phase 4 writes `confirmed`, `rejected`, and `revised` signals but does not read them for product behavior. Phase 5 may use them as deterministic, board-local ranking inputs with small-sample safeguards. Before that work, operators can inspect or delete a board’s rows through service-role tooling. The migration is intentionally unapplied and must follow `docs/PRODUCTION_MIGRATION_RUNBOOK.md`, including a backup.
