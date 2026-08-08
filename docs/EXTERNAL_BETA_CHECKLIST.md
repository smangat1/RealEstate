# Homeboard external beta checklist

The application code can be built and tested locally without these items. The following steps require project-owner accounts, credentials, or deployment choices.

## Security first

- Rotate any database password, Supabase secret key, or routing API key that has ever been pasted into chat, logs, screenshots, or another shared channel.
- Store replacement secrets only in the deployment provider and local `.env.local`; never in Xcode, Swift source, Git, or client-visible environment variables.
- Keep only the Supabase publishable key in the iPhone client.

## Backend and database

- Deploy the Next.js backend to a stable HTTPS origin.
- Configure all variables from `.env.example`; use a Supabase pooler connection for `DATABASE_URL` when the direct hostname is unavailable over IPv4.
- Link the Supabase CLI and run `npx --yes supabase@latest db push` so RLS, push-device, rating, and listing-coordinate migrations are applied.
- Set `ENABLE_APP=true`, `DEMO_MODE=false`, and `HOMEBOARD_NOINDEX=false` for the public beta.
- Run `npm run verify` against the production configuration before opening access.

## Apple and Supabase Auth

- Enable Sign in with Apple for `com.homeboard.native`, `com.homeboard.native.mac`, and the Mac debug App ID; group the related App IDs under one primary identifier.
- Enable the Apple provider in Supabase Auth and list each native App ID in Client IDs. The live project currently reports the Apple provider as disabled.
- Test first-time Apple account creation, returning sign-in, hidden-email relay, account deletion, and an expired invite with non-owner accounts.

## iPhone distribution

- Set `HOMEBOARD_API_BASE_URL` and `HOMEBOARD_PUBLIC_WEB_URL` to the deployed HTTPS origin in the Release build settings.
- Confirm the bundle identifier and Apple development team, then create the App Store Connect record.
- Complete Apple privacy disclosures using `PrivacyInfo.xcprivacy` as the implementation reference.
- Archive a Release build and distribute it to an internal TestFlight group before external review.

## External services

- Add a licensed listings provider behind `ListingProvider`; Homeboard intentionally does not scrape or invent live inventory.
- Configure Apple Push Notification credentials and deploy a notification sender. Device registration is already implemented, but no server sender exists yet.
- Keep OpenRouteService configured for server summaries if desired; the native app already uses MapKit for member-to-listing route comparisons.

## Required human QA

- Use two real accounts on separate devices to create a board, invite a roommate, accept the invite, and verify both see the same changes.
- Add a listing with a photo and exact address, then verify map placement, filters, commute routes, reactions, comments, ratings, rejection, and shortlist behavior.
- Exercise poor-network, expired-session, denied-notification, and missing-location cases.
- Confirm every destructive action has the expected confirmation and that deleted-account data is no longer accessible.
