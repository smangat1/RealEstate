# Homeboard external beta checklist

The application code can be built and tested locally without these items. The following steps require project-owner accounts, credentials, or deployment choices.

## Security first

- Rotate any database password, Supabase secret key, or routing API key that has ever been pasted into chat, logs, screenshots, or another shared channel.
- Store replacement secrets only in the deployment provider and local `.env.local`; never in Xcode, Swift source, Git, or client-visible environment variables.
- Keep only the Supabase publishable key in the iPhone client.

## Backend and database

- The Next.js backend is deployed to the stable Vercel HTTPS origin and native targets use it.
- Production variables, database access, migrations, and RLS are configured; anonymous REST table access has been verified blocked.
- After each deploy, verify `/api/health` returns 200 with configuration and database checks marked `ok`.
- Set `ENABLE_APP=true`, `DEMO_MODE=false`, and `HOMEBOARD_NOINDEX=false` for the public beta.
- Run `npm run verify` against the production configuration before opening access.
- Configure automated backups and complete one restore rehearsal.

## Apple and Supabase Auth

- Sign in with Apple is provisioned for `com.homeboard.native`, `com.homeboard.native.mac`, and the Mac debug App ID. Verify the identifiers are grouped under the intended primary identifier before TestFlight distribution.
- The Apple provider is enabled in Supabase Auth. Reconfirm every shipped native App ID is listed before archiving.
- Test first-time Apple account creation, returning sign-in, hidden-email relay, account deletion, and an expired invite with non-owner accounts.

## Privacy policy and public support

- Publish a real privacy policy at a stable public URL before inviting external testers; the Vercel URL is acceptable until Homeboard has a custom domain.
- Choose and publish the operator name, privacy contact, and support email users can actually reach.
- Describe the data Homeboard stores: account identity, search and work addresses, listing links and extracted facts, preferences, board messages and reactions, invitations, push tokens, device-pairing records, and product analytics.
- Name every enabled processor or external service, including Vercel, Supabase, Apple/MapKit, and any active RentCast, Brave Search, OpenRouteService, or notification provider.
- Define retention periods for active accounts, deleted accounts, application logs, analytics, and provider backups; verify that account deletion matches those promises.
- Link the policy inside the iPhone and Mac apps and in App Store Connect, then make the App Store privacy answers match the shipped build.

## Public website polish

- Verify the homepage, Privacy, Contact, and 404 pages at 320 px, 390 px, tablet, and laptop widths with no horizontal overflow.
- Click every public navigation, footer, logo, install, and email link after each production deployment.
- Keep the mobile menu, favicon, Apple touch icon, route-specific titles, descriptions, and current copyright year covered by the launch-readiness tests.
- Replace `NEXT_PUBLIC_SUPPORT_EMAIL` only with a monitored inbox; never publish a guessed or inactive address.
- Web registration is invite-only; confirm a missing, expired, used, or wrong-email invite cannot create an account.
- Keep the install button connected to honest beta details until a real TestFlight destination is available, then replace the beta message with the official Apple link.
- Check visible copy for debug output, stale success/error banners, fabricated contact details, and accidental placeholder text.
- Deliver large visible imagery through the compressed WebP/JPEG assets and review image weight when screenshots change.

## iPhone distribution

- Set `HOMEBOARD_API_BASE_URL` and `HOMEBOARD_PUBLIC_WEB_URL` to the deployed HTTPS origin in the Release build settings.
- Confirm the bundle identifier and Apple development team, then create the App Store Connect record.
- Complete Apple privacy disclosures using `PrivacyInfo.xcprivacy` as the implementation reference.
- Archive a Release build and distribute it to an internal TestFlight group before external review.

## External services

- Add a licensed listings provider behind `ListingProvider`; Homeboard intentionally does not scrape or invent live inventory.
- The signed iPhone app now registers with APNs in development and declares the production APNs entitlement. Configure an APNs signing key and deploy a notification sender; device registration is implemented, but no server sender exists yet.
- Keep OpenRouteService configured for server summaries if desired; the native app already uses MapKit for member-to-listing route comparisons.

## Required human QA

Run and retain the evidence from [BETA_QA_RUNBOOK.md](BETA_QA_RUNBOOK.md).

- Use two real accounts on separate devices to create a board, invite a roommate, accept the invite, and verify both see the same changes.
- Add a listing with a photo and exact address, then verify map placement, filters, commute routes, reactions, comments, ratings, rejection, and shortlist behavior.
- Exercise poor-network, expired-session, denied-notification, and missing-location cases.
- Confirm every destructive action has the expected confirmation and that deleted-account data is no longer accessible.
- Open the privacy-policy link from the shipped app and verify the live policy, support contact, provider list, and deletion instructions are current.
