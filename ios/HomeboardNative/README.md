# HomeboardNative

The production-direction SwiftUI client for Homeboard.

Open `HomeboardNative.xcodeproj` and run the `HomeboardNative` scheme. The app contains native passwordless Sign in with Apple backed by Supabase sessions, structured onboarding, board invites, map/card search, draw-area and manual filters, per-member MapKit commute routes, overlapping group rating charts, shortlist/update surfaces, member preferences, manual listing collaboration, settings, account controls, and backend persistence.

The checked-in targets use the shared Vercel production deployment. For local development, override `HOMEBOARD_API_BASE_URL` and `HOMEBOARD_PUBLIC_WEB_URL` in the Xcode scheme environment with a reachable development server.

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

All checked-in targets point to the same HTTPS backend so iPhone, Mac, and the
share extensions operate on the same board. Local backend URLs can still be
supplied as Xcode scheme environment overrides.
