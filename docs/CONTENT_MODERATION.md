# Content moderation runbook

Homeboard aims to review every new content report within 24 hours. Alerts for new reports go through the normal Homeboard operational-alert channel. Treat report details and message snapshots as private user data.

Run these statements only through the approved production database console. Replace values inside angle brackets, review the selected row first, and keep the statements inside a transaction until you are certain the target is correct.

## List open reports

```sql
SELECT
  report."id",
  report."reason",
  report."details",
  report."contentSnapshot",
  report."boardId",
  report."messageId",
  report."reportedUserId",
  reporter."displayName" AS "reporterName",
  report."createdAt"
FROM "ContentReport" report
JOIN "User" reporter ON reporter."id" = report."reporterUserId"
WHERE report."status" = 'open'
ORDER BY report."createdAt" ASC;
```

## Remove a reported message

The report keeps its snapshot after the live message is removed.

```sql
BEGIN;

SELECT "id", "boardId", "authorUserId", "authorName", "content", "createdAt"
FROM "ChatMessage"
WHERE "id" = '<message-id>';

DELETE FROM "ChatMessage"
WHERE "id" = '<message-id>';

COMMIT;
```

## Remove a user

Deleting a user cascades through their blocks, submitted reports, memberships, and any boards they own. Confirm the account and owned-board count before committing. Prefer the in-app account deletion path when the user is available because it also removes uploads and the authentication account.

```sql
BEGIN;

SELECT
  user_account."id",
  user_account."email",
  user_account."displayName",
  COUNT(board."id") AS "ownedBoardCount"
FROM "User" user_account
LEFT JOIN "SearchBoard" board ON board."userId" = user_account."id"
WHERE user_account."id" = '<user-id>'
GROUP BY user_account."id", user_account."email", user_account."displayName";

DELETE FROM "User"
WHERE "id" = '<user-id>';

COMMIT;
```

## Resolve a report

Use `removed_content`, `removed_account`, or `no_violation` as the status so the outcome stays understandable.

```sql
UPDATE "ContentReport"
SET
  "status" = '<removed_content|removed_account|no_violation>',
  "resolvedAt" = CURRENT_TIMESTAMP
WHERE "id" = '<report-id>'
  AND "status" = 'open'
RETURNING "id", "status", "resolvedAt";
```

If a threat appears credible or someone may be in immediate danger, preserve the report record, escalate through the established safety process, and do not promise confidentiality or a specific legal outcome.
