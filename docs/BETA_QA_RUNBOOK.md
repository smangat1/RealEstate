# Homeboard beta QA runbook

Use a signed Release/TestFlight build pointed at the production HTTPS backend. Record build number, commit, devices, iOS versions, accounts, start/end time, and any request ID shown in an error response.

## 1. Apple authentication matrix

Run each case with a non-developer Apple account.

- First authorization creates one Homeboard account and never exposes an Apple credential in UI/logs.
- Cancel returns to auth without a stuck spinner or false error.
- Returning sign-in opens the previous board after reinstall.
- Hide My Email creates and restores the same account.
- Expired Supabase session refreshes or returns cleanly to auth.
- Revoked Apple authorization does not expose cached board data.
- Sign-out removes the previous account’s board from the next account’s view.
- Account deletion removes access, user data, memberships, invitations, push devices, and pairing records according to the published policy.

## 2. Two-device collaboration loop

Use two real accounts on two physical devices. Repeat the entire loop 10 times; make run 5 an offline/reconnect run and run 8 a simultaneous-edit run.

1. Account A creates a board and finishes its brief.
2. A creates an email-restricted invite for B and shares it.
3. B accepts and completes personal constraints.
4. A saves a real listing from Safari; B sees it after the documented refresh action.
5. B rates/comments; A sees the same content.
6. A shortlists; B rejects or restores a different listing.
7. Both edit the same allowed field; record the winning value and whether the rule is understandable.
8. Delete one listing while the other device is offline; reconnect and verify it does not resurrect.
9. Sign B out and confirm A’s board is not visible after another account signs in.
10. Relaunch both apps and verify counts, facts, decisions, and activity agree.

Pass only if all 10 runs have no duplicate, resurrected listing, cross-account cache exposure, or unexplained lost update.

## 3. Fifty-link Safari import set

Use exact active unit/property pages, not search results. Retain the URLs privately in the QA log; do not add them to the repository.

- 10 Zillow exact-unit pages across apartment, condo, and house formats.
- 10 StreetEasy exact-unit pages, including same-building/different-unit cases.
- 10 Apartments.com exact-unit pages, including compact `bd`/`ba` cards.
- 5 Realtor.com exact-property pages.
- 10 ordinary broker/property-manager pages with varied markup.
- 5 degraded cases: slow load, missing price, missing unit, unsupported page, and user cancellation.

For each import record completion time, exact source identity, full address/city/state/postal code, unit, rent, beds, baths, square feet, amenities, evidence/confidence, rescan behavior, and manual corrections. Pass at 48/50 successful saves or better, zero recommendation/similar-card swaps, and no silently missing required fact.

## 4. Network and lifecycle

- Launch on Wi-Fi, switch to cellular, background/foreground, then enable airplane mode during create and delete operations.
- Verify saved/syncing/retrying/failed language matches the actual state.
- Force backend timeout and a 5xx response; confirm the app remains usable and the server error can be found by request ID.
- Deny notification permission, later enable it in Settings, and confirm Homeboard does not promise live alerts until the sender is deployed.
- Reinstall the iPhone app and both Safari extensions; verify keychain/app-group board selection does not cross accounts.

## 5. Accessibility and device coverage

- Smallest supported iPhone and a current large-screen iPhone.
- Oldest supported iOS and a current Apple Intelligence-capable device.
- Default and largest practical Dynamic Type sizes.
- VoiceOver order and labels for auth, tabs, listing cards, compare controls, sheets, and destructive confirmations.
- Reduce Motion, keyboard dismissal, one-handed reach, and every empty/error state.

## 6. Release record

Before upload, record the commit and create an immutable tag matching the TestFlight build. Attach the completed run results, known issues, privacy/support URLs, secret-rotation confirmation, backup/restore evidence, and crash/error-monitoring evidence to the release record.
