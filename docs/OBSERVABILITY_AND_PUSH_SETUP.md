# Homeboard monitoring, push, and Advisor automation setup

The code path is complete, but production delivery requires credentials owned by the Homeboard operator. Never commit any value listed below.

## Sentry error monitoring

Create one Sentry Next.js project for the Homeboard deployment. Add these variables to Vercel Production and Preview:

- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN` with release and source-map upload access

The browser and server SDKs do not send default personally identifying information, request bodies, cookies, or authorization headers. Unhandled Next.js failures, selected caught mobile API failures, React render failures, APNs delivery failures, and uploaded iOS MetricKit diagnostics are captured. MetricKit attachments contain Apple crash/hang diagnostic JSON and the app version/build, not Homeboard board content.

In Sentry, create these notification rules:

1. Alert immediately on a new issue with level `fatal`.
2. Alert when server errors exceed five events in ten minutes.
3. Alert immediately when the `homeboard.area` tag is `push` or `ios`.

Send alerts to the monitored operator email. Slack or another incident channel can be added later.

## Optional independent alert webhook

Set `HOMEBOARD_ALERT_WEBHOOK_URL` in Vercel to receive sanitized JSON alerts even if the Sentry integration fails. If the endpoint requires authentication, also set `HOMEBOARD_ALERT_WEBHOOK_BEARER_TOKEN`.

Add the same two names as GitHub Actions repository secrets. The `Production health` workflow checks `/api/health` every ten minutes and calls the webhook if the production deployment or database is unavailable. A failed workflow remains visible in GitHub even when no webhook is configured.

## Apple board and Advisor push

Create an APNs token key in the Apple Developer portal for the Homeboard team, with Push Notifications enabled for `com.homeboard.native`. Add these server-only variables to Vercel:

- `APNS_KEY_ID`
- `APNS_TEAM_ID` (`4SSAVHCM6U` for the current team)
- `APNS_PRIVATE_KEY` (the complete `.p8` value; escaped newlines or base64 are accepted)
- `APNS_BUNDLE_ID` (`com.homeboard.native`)

The provider uses the sandbox APNs endpoint for Debug tokens and production APNs for Release/TestFlight tokens. Invalid and unregistered device tokens are removed automatically.

The sender is excluded from human board-chat notifications. Advisor follow-up drafts, listing changes, and board-comparison flags notify every board member. Tapping any of these notifications opens that board’s Updates tab.

## Advisor proactive schedule

The public repository's `Advisor proactive checks` GitHub Actions workflow invokes `/api/cron/advisor-proactive` hourly. Public-repository Actions minutes are free, and the workflow authenticates with a short-lived GitHub OIDC token restricted to this repository, the workflow file on `main`, and scheduled or manually dispatched runs. No long-lived scheduler secret or paid Vercel cron plan is required.

`CRON_SECRET` remains an optional server-only fallback for operators who later move scheduling to Vercel or another trusted service. The route fails closed unless either that secret matches or the GitHub OIDC token passes signature and claim verification. Only boards whose `AdvisorSubscription.validUntil` is in the future are processed.

The first listing-watch run creates silent baselines. Later runs persist and notify only real price, fee, availability, or status changes. Action fingerprints, snapshot uniqueness, and outreach claim timestamps prevent repeated notifications when a job is retried.

## Release verification

1. Deploy the environment variables and confirm `/api/health` reports monitoring, alerts, board chat push, and Advisor automation as `configured`.
2. Sign into two physical iPhones with different Apple accounts and enable notifications on both.
3. Post from the Updates tab on device A while Homeboard is backgrounded on device B.
4. Confirm B receives one message notification, A receives none, and tapping it opens the correct Updates tab.
5. Trigger one controlled server exception in a non-production test route and confirm Sentry receives the stack and alert.
6. Use Xcode’s MetricKit diagnostic simulation on a Debug build, then confirm the diagnostic appears in Sentry with its JSON attachment.
