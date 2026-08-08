# HomeboardNative

The production-direction SwiftUI client for Homeboard.

Open `HomeboardNative.xcodeproj` and run the `HomeboardNative` scheme. The app contains native passwordless Sign in with Apple backed by Supabase sessions, structured onboarding, board invites, map/card search, draw-area and manual filters, per-member MapKit commute routes, overlapping group rating charts, shortlist/update surfaces, member preferences, manual listing collaboration, settings, account controls, and backend persistence.

The Simulator uses `http://127.0.0.1:3000` by default. A physical-device build must set `HOMEBOARD_API_BASE_URL` and `HOMEBOARD_PUBLIC_WEB_URL` to a reachable HTTPS deployment in Xcode build settings.

Generate and verify the project from the repository root with `npm run ios:generate`, `npm run ios:test`, and `npm run ios:release`. The unit suite covers profile completion and exact listing-coordinate persistence; the UI suite verifies a clean first launch on the supported simulator.

The app registers the `homeboard://` URL scheme. A link such as `homeboard://invite/ABC123` stages the invite code, then continues through real authentication before joining the board.

The empty `UILaunchScreen` entry in `HomeboardNative/Info.plist` is intentional. Removing it causes modern simulators to render the app inside an incorrect inset compatibility canvas.

## Mac Safari connection

The `Homeboard Safari Setup (Mac)` scheme builds a small macOS companion app containing the
`HomeboardMacSafariExtension`. Run it once, continue with the same Apple
Account used on iPhone, choose the destination board, and use **Enable in
Safari**. Clicking Homeboard in Safari's toolbar then runs the blue in-page
scan and review flow on the current rental.

Reviewed Safari saves post directly to
`/api/mobile/boards/:boardId/listings` with the shared Supabase session. The
iPhone refreshes that same board whenever it becomes active. If the backend is
temporarily unreachable, the extension retains the reviewed listing in the
local App Group queue and the Mac app's **Sync offline saves** action retries
it.

For local development, the Mac target uses `http://127.0.0.1:3000` and the
iPhone targets use the LAN address configured by `HOMEBOARD_API_BASE_URL`.
Production builds should point every target to the same HTTPS backend.
