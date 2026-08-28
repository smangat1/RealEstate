# Homeboard

Homeboard is a shared rental workspace for groups searching for a home together. It keeps the group brief, member preferences, real listing links, reactions, comments, decisions, and activity in one place instead of scattering the search across texts and screenshots.

The current beta path is deliberately non-AI. Onboarding is a deterministic set of focused questions, and every listing shown in the workspace must be added by a person or a future configured provider. Homeboard does not scrape sites or fabricate inventory.

## Product surfaces

- Passwordless Sign in with Apple on iPhone and Mac, backed by persisted Supabase sessions
- Email-bound board invitations, invite links, acceptance, cancellation, and membership
- Structured onboarding for budget, timing, group size, commute, neighborhoods, priorities, must-haves, dealbreakers, and rental readiness
- A three-tab iPhone workspace: map/card search, shortlist, and group updates
- Manual price, bedroom, and neighborhood filters plus a draw-on-map search area
- Per-member MapKit commute routes, travel times, and distances for a selected listing
- Six-dimension group-fit ratings with overlapping member radar charts
- Member preference cards and shared search-brief editing
- Source-first listing collection with exact-unit links, trust state, confirmations, reports, notes, price history, reactions, and comments
- Safari Web Extension that captures the open rental's source, thumbnail, address, price, beds, baths, and square footage when the page exposes them
- iOS Share Extension for sending Zillow, StreetEasy, or broker-app links directly to the active board
- Private RentCast candidate catalog; candidates stay out of discovery until an exact source is community-supported or verified
- Open decisions, board activity, multiple boards, board renaming, leave/delete board, and account deletion
- OpenRouteService-ready commute architecture
- APNs device-token registration plumbing for a future notification sender
- Controlled RentCast catalog refreshes protected by an application and database hard limit of 50 requests per 32-day safety window
- Cached, no-retry Brave source resolution protected by a 500-request monthly ceiling

## Stack

- Native iPhone app: SwiftUI in `ios/HomeboardNative`
- Backend: Next.js App Router and TypeScript
- Data: Prisma and Supabase Postgres
- Identity: Supabase Auth
- Native routing: Apple MapKit directions for each member commute anchor
- Backend routing: OpenRouteService when configured for server-side summaries

## Local backend

1. Keep the repository downloaded locally if it lives in iCloud Drive. Optimized/offloaded source files can make Node or Xcode appear to hang.
2. Install dependencies: `npm ci`
3. Create `.env.local` from `.env.example`. Use the same Supabase URL and publishable key for both the server and `NEXT_PUBLIC_` variables; keep the secret key and database connection server-only.
4. Generate Prisma: `npx prisma generate`
5. Link the Supabase CLI with `npx --yes supabase@latest link --project-ref YOUR_PROJECT_REF`, then apply migrations with `npx --yes supabase@latest db push`. A Supabase pooler URL is recommended for `DATABASE_URL` when the direct hostname is not reachable over IPv4.
6. Run checks: `npm run verify`
7. Start the backend: `npm run dev`

The local API is available at `http://127.0.0.1:3000`. The project uses Webpack for local Next.js builds because Turbopack rejects dependency symlinks used by some iCloud-safe setups.

## Native iPhone app

Open:

```text
ios/HomeboardNative/HomeboardNative.xcodeproj
```

`HomeboardNative` is the only active iOS app and scheme.

For the iPhone Simulator, start the backend first. The app defaults to `http://127.0.0.1:3000`.

For a physical iPhone or external beta, configure these Xcode build settings:

- `HOMEBOARD_API_BASE_URL`: the HTTPS URL of the deployed Next.js backend
- `HOMEBOARD_PUBLIC_WEB_URL`: the HTTPS origin used for shareable invite links

Then select your Apple development team, choose the phone, and run. The Supabase publishable key is safe to ship in a client; service-role/database credentials must remain backend-only.

Both `Save to Homeboard` extensions use the `group.com.homeboard.native` app group. Keep that app group enabled for the app, `HomeboardShareExtension`, and `HomeboardSafariExtension` targets when changing signing teams.

After installing the app, enable its Safari extension once:

1. Open iPhone Settings, then Apps, Safari, Extensions.
2. Turn on `Save to Homeboard` and allow access to the rental websites you use.
3. Open an exact rental page in Safari, use Safari's page menu to open `Save to Homeboard`, review the captured preview, and tap `Save to Homeboard`.
4. Tap `Open Homeboard` to confirm missing facts and add the rental to the active board.

From a native listing app, use its normal Share button and choose `Save to Homeboard`. Native apps usually share only a link and title, while the Safari path can capture the structured facts and social-preview thumbnail already exposed by the page.

Invite links can open the web acceptance flow or hand off to the installed app through `homeboard://invite/CODE`.

## Verification

```bash
npm run test
npm run typecheck
npm run build
npm run ios:test
npm run ios:release

xcodebuild -quiet \
  -project ios/HomeboardNative/HomeboardNative.xcodeproj \
  -scheme HomeboardNative \
  -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO
```

## Remaining external integrations

- Add the provisioned iPhone and Mac App IDs to Supabase Auth's Apple provider Client IDs, then verify the related App IDs are grouped under one primary App ID before distribution.
- Deploy the Next.js backend and set the two native URL build settings.
- Supply a Supabase pooler connection string if the direct database hostname is not reachable over IPv4.
- Set `HOMEBOARD_ADMIN_EMAILS` for server-only source verification.
- Set `BRAVE_SEARCH_API_KEY` only when source resolution is ready to use. Resolution is permanently cached and never retries automatically.
- Add Apple push credentials and a notification sender if live push notifications are desired.
- Configure OpenRouteService in the backend for live commute routes.

Unlinked provider candidates are intentionally private. The user-facing catalog contains only community-supported or verified exact listing sources.

Use [`docs/LISTINGS_API_INTEGRATION.md`](docs/LISTINGS_API_INTEGRATION.md) for the exact backend, database, endpoint, and native-client wiring sequence once a licensed provider is selected.

The remaining deployment-owner tasks are tracked in [the external beta checklist](docs/EXTERNAL_BETA_CHECKLIST.md).
