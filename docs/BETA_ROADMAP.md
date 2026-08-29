# Homeboard beta roadmap

Last audited: August 28, 2026

## Beta definition

The first credible beta is an invitation-only iPhone product where roommates:

1. create or join one shared board;
2. save exact rental links from Safari;
3. retain the full address, unit, rent, beds, baths, square feet, amenities, and grounded model observations;
4. compare price, commute, space, neighborhood, and home features;
5. comment, rate, shortlist, reject, and revisit decisions across devices.

Public listing discovery, licensed listing photos, a Zillow-sized inventory feed, and perfect push notifications are not required for this beta. The exact-link collaboration workflow is the product being tested.

## Current build status

- The paid Apple Developer Program team signs the iPhone and Mac apps with Xcode-managed profiles.
- Every iPhone and Mac build configuration now uses Sign in with Apple; the temporary Debug password fallback has been removed.
- The signed iPhone Debug profile includes Sign in with Apple, development APNs, App Groups, and shared Keychain access. Release declares production APNs.
- The Apple provider is enabled in the live Supabase project; end-to-end real-account device testing remains open.
- Native targets use the stable HTTPS Vercel deployment, production migrations/RLS are applied, and public Supabase REST reads are blocked.
- TypeScript checks and all 93 automated tests pass; tracked-secret scanning and web CI are part of verification.
- The native iOS test bundle compiles for a generic physical device, but the full native suite has not been run as a signed device test suite.
- Listing mutation journaling, URL-and-unit deduplication, deletion retry, richer SLM evidence, and comparison-map evidence scoring are implemented.
- Web registration is invite-gated, a non-secret readiness endpoint exists, and the app has privacy-safe beta feedback plus honest notification status.

## P0 — blockers before any external tester

### 1. Put the source tree in a recoverable state

- [ ] Create a clean beta branch and commit the actual native app, mobile API, migrations, tests, and documentation.
- [x] Resolve the stale `.git/index.lock`; no lock remains and Git operations are healthy.
- [ ] Remove or archive the `.icloud-placeholder-*` copies and `node_modules.dataless-old` after verifying the active files.
- [ ] Move the working repository out of an iCloud-offloaded folder or guarantee that every source file stays downloaded.
- [ ] Tag the exact commit used for each TestFlight build.

Exit condition: a fresh clone on another Mac can install dependencies, generate the Xcode project, and produce the same builds.

### 2. Rotate credentials and close development access

- [ ] Rotate the Supabase secret/service key, database password, routing key, and any other credential exposed during development.
- [ ] Confirm that only the Supabase publishable key exists in client code.
- [ ] Delete the `demoaccount` Supabase user before external distribution.
- [x] Remove reusable development-account behavior from native code and the account API.
- [x] Verify that Debug-only password login is not compiled into Release.
- [x] Add tracked-secret scanning to required verification and web CI.

Exit condition: no beta-distributed binary, repository commit, build log, or documentation contains a server credential or shared test password.

### 3. Deploy a real backend

Current state: native targets use the stable Vercel HTTPS origin. Production database access, migrations, and RLS are active. Backups and a restore rehearsal remain operator work.

- [x] Choose and deploy one stable HTTPS Next.js origin.
- [x] Provision the production PostgreSQL/Supabase connection.
- [x] Configure the required production runtime variables.
- [x] Set Release `HOMEBOARD_API_BASE_URL` and `HOMEBOARD_PUBLIC_WEB_URL` to the HTTPS origin.
- [x] Apply Supabase migrations and verify anonymous public-table access is rejected.
- [x] Add a production health check for required configuration and database access without exposing secrets.
- [ ] Configure backups and perform one restore rehearsal.
- [x] Gate legacy web account creation behind a pending, unexpired board invite.

Exit condition: a phone on cellular data can sign in, create a board, save a link, relaunch, and retrieve the same board without a development Mac running.

### 4. Finish production authentication and signing

Current state: Apple signing, native entitlements, and the live Supabase Apple provider are enabled. End-to-end sign-in has not been exercised across the full real-account matrix.

- [x] Enroll in and select the paid Apple Developer Program team.
- [x] Register the iOS and Mac App IDs and enable Sign in with Apple.
- [ ] Group related identifiers under the correct primary App ID.
- [x] Enable the Apple provider in Supabase and configure the native client IDs.
- [ ] Test first-time creation, returning sign-in, hidden-email relay, canceled authorization, revoked authorization, expired sessions, and account deletion.
- [ ] Create the App Store Connect record and internal TestFlight group.
- [ ] Archive and upload a signed Release build; do not distribute the Debug fallback.

Exit condition: two previously unused Apple accounts can independently create Homeboard accounts through TestFlight and sign back in after reinstalling.

### 5. Prove multi-user board consistency

- [ ] Run create-board → invite → accept on two real accounts and two devices.
- [ ] Confirm additions, edits, notes, comments, ratings, rejections, and deletions converge on both devices.
- [ ] Test simultaneous edits and define which update wins.
- [ ] Add a visible sync state: saved, syncing, retrying, or failed.
- [ ] Keep the persisted mutation journal, but add server/network tests for interrupted create and delete operations.
- [ ] Add either Supabase Realtime or a documented foreground/polling refresh policy so users do not mistake stale data for current data.
- [ ] Verify that signing out one account never exposes the previous account's cached board.

Exit condition: the two-device collaboration script passes 10 consecutive times, including one offline/reconnect run, with no duplicate or resurrected listing.

### 6. Harden the Safari import workflow

- [ ] Test real unit pages and building pages from Zillow, StreetEasy, Apartments.com, Realtor.com, and ordinary broker sites.
- [ ] Confirm `bd` means bedroom and `ba` means bathroom across compact card formats.
- [ ] Confirm the full address includes city, state, and postal code when the source exposes them.
- [ ] Confirm recommendation, similar, sponsored, and nearby cards cannot replace the primary listing.
- [ ] Confirm multiple units on one building URL remain distinct by unit.
- [ ] Exercise missing-field rescan, manual correction, timeout, cancel, page-load failure, and unsupported-site states.
- [ ] Validate grounded SLM evidence: every qualitative insight must retain an evidence phrase and confidence; ungrounded claims must be discarded.
- [ ] Test devices where Foundation Models is unavailable and ensure deterministic extraction remains understandable.
- [ ] Measure import completion time and remove any scan stage that does not improve saved facts.

Exit condition: at least 50 varied real-world imports achieve 95% successful saves, zero primary/similar-card swaps, and no silent missing-field failure.

### 7. Complete privacy, safety, and data lifecycle work

- [ ] Publish a privacy policy, terms of use, support page, and support email on a stable public URL.
- [ ] Identify the public operator and privacy contact, list every enabled data processor, and choose written retention periods for accounts, logs, analytics, and backups.
- [ ] Match App Store privacy answers to `PrivacyInfo.xcprivacy` and actual server collection.
- [ ] Verify account deletion removes or anonymizes boards, membership, invitations, push tokens, analytics, and user content according to a written retention rule.
- [ ] Audit every mobile API route for board membership and ownership checks.
- [ ] Move public mutation throttling from process memory to a shared production store.
- [ ] Add abuse controls for invitations, comments, source reports, uploads, and repeated account creation.
- [ ] Review neighborhood and recommendation language for fair-housing risk and protected-class proxies.
- [ ] Document how listing links and extracted evidence are stored and who on a board can see them.

Exit condition: there are no unresolved high-severity security findings, account deletion is verified end to end, and the required public policies are live.

### 8. Add production observability

- [ ] Add native crash reporting with dSYM upload.
- [ ] Add structured server error reporting; unique request correlation IDs are now attached.
- [ ] Record import success/failure, sync retries, auth failures, route failures, and comparison load time without storing sensitive listing text in logs.
- [ ] Create alerts for backend unavailability, elevated 5xx responses, database saturation, and repeated auth failure.
- [x] Add an in-app beta feedback action with app version and a user-approved, privacy-safe diagnostic summary.

Exit condition: a forced test crash and forced server error are visible to the team with enough context to diagnose them.

### 9. Run release QA and App Store preparation

- [ ] Test the oldest supported iPhone/OS combination and at least one current Apple Intelligence-capable phone.
- [ ] Test small and large screens, dark mode, Dynamic Type, VoiceOver, Reduce Motion, keyboard dismissal, and one-handed use.
- [ ] Exercise Wi-Fi → cellular switching, airplane mode, background/foreground, expired auth, and backend timeout.
- [ ] Profile map clustering, comparison scoring, geocoding, and route loading with Instruments on a physical phone.
- [ ] Verify extension installation, Safari sharing, shared Keychain access, and board selection after reinstall.
- [ ] Prepare icon, screenshots, description, privacy answers, support URL, review notes, and a reviewer test account if Apple requires one.
- [ ] Verify export-compliance settings and all permission descriptions.

Exit condition: no P0/P1 crash or data-loss bug remains, and the signed TestFlight build passes the complete release script.

## P1 — strongly recommended for a useful beta

### Product clarity

- [ ] Add a short first-board walkthrough: save a link, add work destinations, compare, decide.
- [ ] Make empty states explain the next useful action without inserting fake or stale listings.
- [ ] Show which comparison facts are hard data, roommate input, route data, or model evidence.
- [ ] Add a side-by-side comparison sheet for two or three listings.
- [ ] Make work destinations and commute limits easy to edit directly from comparison.
- [x] Clearly label notification permission/device registration while the server sender is not enabled.

### Comparison quality

- [ ] Calibrate the five scoring dimensions against a hand-ranked set of real listings.
- [ ] Prevent one unknown or low-confidence model signal from creating a misleading winner.
- [ ] Explain why a region/listing is green, yellow, or red in one compact sentence.
- [ ] Test transit, walking, and driving routes separately and document fallback behavior.
- [ ] Cache routes and geocoding with explicit freshness limits.
- [ ] Keep the map visually sparse at city scale and profile hundreds of nodes.

### Collaboration quality

- [ ] Add a lightweight activity unread state.
- [ ] Add undo for accidental rejection/removal where server semantics permit it.
- [ ] Make invite failure, expiration, and already-member states actionable.
- [ ] Preserve a decision history so the group can understand why a listing was rejected.
- [ ] Decide whether push notifications ship; either implement the sender/preferences/monitoring or remove the beta-facing notification promise.

## P2 — useful additions after beta stability

- [ ] Saved comparison presets for different work or lifestyle scenarios.
- [ ] A weekly digest of new comments, changed rent, and unresolved decisions.
- [ ] Export/share a compact comparison summary with roommates.
- [ ] Commute-mode preferences per member rather than one generic route assumption.
- [ ] Listing freshness reminders and user-triggered source re-verification.
- [ ] Admin tools for source conflicts, abusive reports, and account support.
- [ ] A licensed public inventory or photo feed only after legal display, caching, attribution, and retention rights are documented.

## Suggested execution order

### Milestone 0 — repository and security (1–2 focused days)

Resolve the Git lock/iCloud duplicates, create the beta branch, commit the product, rotate secrets, and remove the development account from the eventual Release environment.

### Milestone 1 — production foundation (2–4 days)

Deploy HTTPS backend, apply migrations/RLS, configure backups, set Release URLs, establish the paid Apple team, enable Apple/Supabase auth, and upload the first internal TestFlight build.

### Milestone 2 — collaboration and import reliability (3–6 days)

Run the two-device script, implement visible sync status/realtime policy, harden interrupted mutations, execute the 50-link import set, and fix every primary/similar-card or full-address failure.

### Milestone 3 — product and release QA (3–5 days)

Calibrate comparison explanations, add side-by-side comparison if time permits, complete accessibility/network/device QA, add observability and feedback, and publish privacy/support pages.

### Milestone 4 — internal soak (at least 5 days)

Use 5–10 real testers and real boards. Triage daily. Freeze new features unless they resolve a repeated usability failure.

### Milestone 5 — controlled external beta

Expand to roughly 25 invited users, monitor auth/import/sync/crash metrics, and keep a server-side kill switch and rollback build ready.

## Beta release gate

Do not open the external beta until all of these are true:

- [ ] Zero open P0 issues and no known data-loss bug.
- [ ] A tagged, reproducible Release commit exists.
- [ ] Signed TestFlight build uses the production HTTPS backend and Apple auth.
- [ ] Two-device collaboration passes 10/10 runs.
- [ ] Fifty-link import set meets the reliability target.
- [ ] Account deletion, RLS, secret rotation, backups, and restore have been verified.
- [ ] Crash/error monitoring and an in-app feedback route are working.
- [ ] Privacy policy, terms, support URL, App Store privacy answers, and fair-housing review are complete.
- [ ] Five-day internal soak reveals no unresolved crash, auth lockout, duplicate/resurrected listing, or cross-account data leak.

## Explicitly deferred from this beta

- A public portal-scale rental inventory.
- Storing or redistributing listing photos without a license.
- Automated scraping of protected listing sites.
- Paid listing-provider integration unless exact-link testing proves it is necessary.
- Broad public signup before invitation-only collaboration is stable.

The shorter operational checklist remains in [EXTERNAL_BETA_CHECKLIST.md](EXTERNAL_BETA_CHECKLIST.md).
The current product/UX assessment is in [CURRENT_APP_STATE.md](CURRENT_APP_STATE.md), and manual release scripts are in [BETA_QA_RUNBOOK.md](BETA_QA_RUNBOOK.md).
