# Homeboard current app state

Audited: August 28, 2026
Current product version: 0.0.13

## Executive summary

Homeboard is a shared rental-search workspace for people choosing a home together. Its strongest idea is not “find every apartment.” It is “turn scattered listing links and roommate opinions into one understandable group decision.”

The iPhone app is the main product. A marketing and account website supports it, a Safari share extension captures exact rental pages, and a Mac companion connects desktop Safari to the same board. The core workflow is unusually complete for a pre-beta product: a group can define its constraints, import a real listing, preserve the source facts, compare tradeoffs, discuss it, and move it through a decision.

The app currently feels designed rather than assembled. It has a dark green-charcoal palette, cream typography, editorial serif headlines, framed surfaces, restrained accent color, deliberate haptics, and short guided moments. It feels calm and serious about a stressful decision. Once a user reaches a populated board, however, the capability density becomes high. Settings is long, comparison is sophisticated, and the distinction between hard facts, roommate input, route data, and model evidence still needs repeated real-user validation.

The correct release state today is **internal beta candidate**, not open external beta. The product and deployment foundation exist, but real-device Apple authentication, two-person convergence, 50-link import reliability, legal/support publication, account-deletion verification, backups, and production crash/error monitoring remain release gates.

## What the product is

Homeboard combines five jobs that roommate groups normally split across browser tabs, text messages, notes, and spreadsheets:

1. Build one shared rental brief: budget, timing, commute, neighborhoods, must-haves, nice-to-haves, and dealbreakers.
2. Save the exact apartment or house page from Safari instead of copying partial details into chat.
3. Preserve the listing’s address, unit, rent, beds, baths, square footage, amenities, source URL, and grounded observations.
4. Compare price, commute, space, neighborhood fit, and home features against the group’s actual priorities.
5. Keep comments, reactions, ratings, shortlist/reject decisions, tours, applications, and group updates attached to the shared board.

Homeboard is intentionally not a Zillow-sized public inventory and does not need to become one for beta. The exact-link collaboration loop is already a coherent product.

## How it feels to use

### First impression

The launch sequence gives the logo a short, dedicated moment while app bootstrap begins in the background. The user then enters a two-card vertical story rather than a conventional landing form. The opening line—“Finding a place with friends doesn’t have to end your friendship”—positions the product around relationship friction, not database size.

The presentation is polished and spatial: dark neutral surfaces, window-like cards, large serif statements, light motion, and a small amount of warm accent color. It feels closer to a considered consumer Apple app than a generic property dashboard.

### During setup

Sign in is intentionally narrow: Continue with Apple, then either create/start a board or join one with an invite. Onboarding asks for the information the comparison system actually uses. That makes setup feel purposeful, though it is still a meaningful commitment before the user sees a fully useful board.

### Inside a board

The board feels like a decision workspace rather than a feed. Search/list views provide the working set, Shortlist holds serious candidates, Updates gives the group a shared narrative, and deeper Compare, Members, and Setup screens appear contextually. Skeletons represent genuine pending work; they do not intentionally delay entry.

The comparison map is a differentiator. It brings listings, work destinations, commute routes, and scored regions into one view, then explains price, commute, space, neighborhood, and feature tradeoffs. The risk is cognitive load: users need to trust where each signal came from and understand uncertainty without reading a scoring manual.

### Saving a listing

On iPhone, the user opens an exact rental page in Safari and shares it to Homeboard. The extension visually follows the relevant page text, rejects recommendation/similar-card substitutions, performs one deeper rescan when useful, and presents a review step for address, rent, beds, baths, and other facts. On Mac, the Safari extension uses the same authenticated board path after pairing or Apple sign-in.

This workflow feels careful and grounded. It also has the largest real-world reliability surface because listing sites vary constantly. The implementation is defensive, but the required 50-link device corpus has not yet been completed.

## End-to-end user flow

### New board owner

1. Open the iPhone app and see the short branded launch animation while session/bootstrap work begins.
2. Swipe through the two-card product story.
3. Continue with Apple.
4. Choose to start a board.
5. Complete the rental brief: group setup, budget, move timing, commute access, target neighborhoods, and priorities.
6. Land on the board and follow the first-use guide to save a real listing from Safari.
7. Review the extracted facts, correct anything uncertain, and add the listing.
8. Invite roommates with a shareable code or an email-restricted invitation.
9. Compare candidates, discuss them, and change their status as the search progresses.

### Invited roommate

1. Open the invite link/code.
2. Sign in with Apple in the native app, or create a web account only through the active invite flow.
3. Accept the board invitation.
4. Add personal budget, commute, preference, and dealbreaker information.
5. Review the existing shortlist and add ratings, comments, reactions, and decisions.

### Mac/Safari user

1. Open the Homeboard Mac setup app.
2. Pair it by scanning a short-lived QR request with the signed-in iPhone, or use Apple sign-in.
3. Choose the active board.
4. Open an exact listing page in Safari and save it through the extension.
5. See the same saved listing on the shared board.

## Current surfaces

- **Public website:** branded, mobile-paged product story, install/beta information, route-specific share previews, Privacy, Contact, and custom 404 pages.
- **iPhone app:** launch, welcome, Apple authentication, invite/board choice, onboarding, board/list, shortlist, compare/map, updates, members, setup, account deletion, notification registration, and beta feedback.
- **iPhone Safari share extension:** exact-page scanning, evidence capture, review/correction, and authenticated board save.
- **Mac setup app and Safari extension:** QR/Apple authentication, board selection, shared keychain/app-group state, and desktop listing capture.
- **Backend:** Next.js mobile/web API, Prisma/PostgreSQL, Supabase Auth/admin integration, private data policies, invitation and pairing flows, listing analysis, route summaries, analytics, and a public readiness endpoint.

## What is working well

- The product has a clear point of view: improve the group decision, not the size of the inventory.
- The visual system is consistent across launch, onboarding, board surfaces, sharing, and public pages.
- Exact-source preservation, unit-aware deduplication, similar-card rejection, missing-field review, and grounded evidence rules show good data discipline.
- Collaboration goes beyond “share a favorite”: comments, ratings, reactions, updates, roles, invites, statuses, and comparison are connected.
- Launch animation and skeleton behavior overlap real work rather than adding artificial wait time.
- Release targets use the deployed HTTPS backend and paid Apple signing capabilities.
- Supabase public tables reject anonymous REST access; RLS migrations are applied.
- The codebase now has automated tracked-secret scanning, web CI, per-request correlation IDs, and a public configuration/database readiness check.

## Friction and risks

### User experience

- A new user must provide enough brief information before the comparison value becomes obvious.
- The board has more depth than the three main tabs reveal; users may not discover Compare, Members, or setup tools at the right moment.
- Comparison confidence and provenance need clearer repeated cues during actual group decisions.
- Real board freshness is not yet proven through 10 consecutive two-device/offline runs, and there is no completed realtime/unread strategy.

### Reliability

- The Safari importer still needs the 50-link cross-site physical-device test set.
- APNs permission and device-token registration exist, but no production notification sender exists. The UI now labels this honestly.
- Apple sign-in is configured and builds are signed, but first-time/returning/hidden-email/revoked-session cases need real-device proof.
- Account deletion exists but still needs an end-to-end production data-lifecycle audit.

### Operations and release

- No native crash reporter with dSYM upload is connected.
- Request IDs now exist, but structured server error collection and alerts are not connected to an operator service.
- Privacy and Contact pages are present but not yet final legal/support commitments; Terms of Use and a monitored support inbox are still required.
- Backup/restore rehearsal, credential rotation, App Store Connect setup, TestFlight upload, accessibility/device QA, and an internal soak are human/operator work still outstanding.
- Ignored iCloud duplicate files and an obsolete dependency folder remain in the local workspace and should be archived or removed after iCloud is no longer holding them open.

## Changes made during this audit

- Closed unrestricted web registration: account creation now requires a pending, unexpired board invite and enforces an invite’s email restriction.
- Fixed auth redirects so notices/errors append correctly to paths that already contain query parameters.
- Removed all source and API behavior that preserved a reusable development account.
- Added `GET /api/health`, which checks required configuration and database connectivity without returning secret names or values.
- Added a Settings feedback flow with user-entered context and a reviewable diagnostic summary containing version/state counts only.
- Relabeled notifications as device permission/registration while explicitly stating that live server delivery is pending.
- Added unique request correlation IDs to application responses.
- Added tracked-secret scanning to the required verification command and a GitHub Actions web verification workflow.
- Added automated tests covering beta registration, health-check privacy, feedback privacy, notification honesty, demo-bypass removal, CI, secret scanning, and request IDs.

## Release recommendation

Proceed to a small internal TestFlight run after the following four checks pass: two unused Apple accounts can sign in; two devices complete one full invite/collaboration run; one iPhone saves representative links from each supported site; and account deletion is verified in production. Do not call the product an external beta until the full P0 gate in `BETA_ROADMAP.md` is complete.

The actionable manual scripts are in `BETA_QA_RUNBOOK.md`. The shorter operator checklist is in `EXTERNAL_BETA_CHECKLIST.md`.
