# Homeboard product report

Prepared: August 30, 2026  
Current version: 0.0.13  
Product stage: Internal beta candidate

## Executive summary

Homeboard is a shared rental-decision workspace. It is built for roommates, couples, and other groups who are trying to choose a home together but currently conduct the search across listing websites, browser tabs, group chats, map apps, notes, and spreadsheets.

The central product idea is simple:

> Homeboard does not need to own every listing. It needs to help a group understand and choose among the homes they already find.

Users save exact rental pages into one shared board. Homeboard preserves the listing facts, compares each home against the group’s budgets, commutes, priorities, and dealbreakers, and keeps the resulting conversation attached to the home. The product turns a chaotic stream of links and opinions into a visible decision process.

The iPhone app is the main product. A public website explains the idea and handles shared-link previews. An iPhone Safari web extension captures rentals from the phone. The older share extension remains available in source as a dormant fallback target but is not embedded in the app. A lightweight Mac companion connects the same board to a Safari extension on desktop. The backend manages accounts, boards, invitations, listing imports, collaboration, and comparison data.

The current build is beyond a prototype. Its core loop is functional and coherent, but it should still be described as an internal beta candidate. Real-device authentication, multi-user consistency, cross-site Safari-import reliability, distribution, monitoring, support, and legal operations still need to be proven before an open beta.

## The idea

Rental search products are usually designed around inventory: show more homes, add more filters, and encourage more browsing. That solves discovery, but it does not solve the part that becomes hardest when several people are involved.

A real group has competing constraints:

- One person cares most about commute time.
- Another has less room in their monthly budget.
- Someone wants a specific neighborhood or transit line.
- Someone else cares about natural light, space, laundry, or a home-office layout.
- The group must remember which facts were verified, which were assumptions, and why a listing was kept or rejected.

Today, that information is fragmented. Listings live on multiple sites. Opinions live in messages. Commute checks are repeated in Maps. Important concerns disappear under newer links. The same debate happens more than once because the group has no shared memory.

Homeboard is the decision layer above that fragmented search. Its job is to align the group, collect the real candidates, explain the tradeoffs, and preserve the decision.

## What Homeboard aims to achieve

Homeboard is designed around five outcomes.

### 1. Replace link chaos with a shared working set

Every serious rental stays in one board with its exact source, unit, price, bedrooms, bathrooms, square footage, amenities, notes, and current status.

### 2. Make roommate constraints explicit and fair

Each person contributes a personal budget, commute needs, neighborhood preferences, priorities, and dealbreakers. The group can see differences early instead of discovering them after falling in love with a home.

### 3. Explain tradeoffs instead of hiding them in a score

Homeboard can compare price, commute, space, neighborhood fit, and home features. The goal is not to announce a mysterious winner. It is to show why a home works, where it compromises, and who feels that compromise.

### 4. Keep the conversation attached to the decision

Comments, reactions, ratings, shared notes, open questions, tours, applications, shortlist decisions, and rejections remain connected to the relevant listing and board.

### 5. Reduce relationship friction

The emotional promise is larger than organization. Homeboard aims to make a high-stress group decision feel calmer, more honest, and less likely to damage the relationships involved.

## Product positioning

The clearest category description is:

**A collaborative rental-decision workspace.**

Homeboard is not currently trying to be:

- A replacement for Zillow, StreetEasy, Realtor, or broker websites.
- A public listing marketplace with its own complete inventory.
- A property-management or rent-payment product.
- An automated system that chooses a home without the group.

Those boundaries are useful. They let the beta test Homeboard’s actual advantage without depending on expensive listing licenses or rebuilding discovery products that already exist.

The strongest initial audience is a group of two to four renters in a competitive, commute-sensitive market. New York is the natural first proving ground, although the data model supports other cities and solo renters.

## How the product feels

Homeboard is intended to feel calm, deliberate, and editorial rather than transactional.

The visual language uses dark green and charcoal surfaces, warm cream typography, large serif statements, framed cards, restrained motion, and small moments of tactile feedback. The experience treats finding a home as an important life decision rather than a feed to scroll forever.

The opening message—“Finding a place with friends doesn’t have to end your friendship”—establishes the emotional problem immediately. Inside the app, the structure becomes more practical: a map and working board, a serious shortlist, and a shared update history.

The experience is strongest when a real board contains several listings and more than one person. At that point, the product feels like a group memory and decision system. Before that point, onboarding must ask for enough information to make future comparison useful, so the early experience carries more setup friction than a simple bookmarking app.

## What exists today

### iPhone app

The iPhone app includes:

- A branded startup animation that overlaps real background loading.
- A short two-page introduction and board-access screen.
- Sign in with Apple.
- New-board and invite-link entry paths.
- A rental brief covering the group, city, budget, move timing, commute, neighborhoods, priorities, must-haves, and dealbreakers.
- Search/map, Shortlist, and Updates tabs.
- Listing details, exact source links, notes, comments, reactions, ratings, and status changes.
- Group comparison across practical and lifestyle priorities.
- Member preferences, open decisions, invitations, setup, feedback, account deletion, and notification registration.

### Listing capture

On iPhone, a user completes a guided one-time Safari and supported-site access setup. Opening an exact rental page on a supported site then triggers a quiet scan automatically. A standalone pill appears above Safari's controls with the address, unit, rent, bedrooms, and bathrooms. If the page contains multiple units, each unit appears as its own pill. Nothing saves until the user taps a pill. The selected pill briefly confirms success and dismisses itself; a full review only appears when required facts are missing, and the Page Menu action remains available as a manual fallback.

On Mac, a Safari toolbar button opens a branded review card on the listing page. The user can confirm or edit the facts and save them to the selected shared board. The review supports keyboard interaction, including Escape to close and Command-Enter to save.

### Mac companion

The Mac product is a lightweight setup and credential companion, not a second full Homeboard app. It:

- Pairs securely with a signed-in iPhone through a short-lived QR code.
- Offers Sign in with Apple as a fallback.
- Lets the user select the destination board.
- Reports whether the Safari extension is actually enabled.
- Opens the correct Safari Settings screen.
- Syncs any offline Safari saves.

### Website

The website provides:

- The public product story.
- Product, privacy, contact, and install information.
- Rich previews for the main marketing pages and board invitation links.
- A dedicated Homeboard for Safari setup page.
- A native share action that can AirDrop, Message, or copy the setup link to a Mac.
- A branded install fallback for invitation recipients when the official TestFlight/App Store URL is configured.

### Backend and security

The backend uses Next.js, Prisma/PostgreSQL, and Supabase authentication. Boards are private and invitation-based. Public database-table access is blocked, invitation and Mac-pairing secrets are short-lived or hashed, and client apps do not contain server credentials.

## User flow from install

The product has three connected entry paths: a new board owner, an invited roommate, and a Mac Safari user.

### Flow A: a new board owner

1. **Discover Homeboard.** The user sees the website, receives a beta link, or hears about the product from a roommate.
2. **Install the iPhone app.** During the private beta, installation is through the official TestFlight destination once that link is configured. Later, this becomes the App Store path.
3. **Open the app.** A short logo animation plays while account and board state load in the background. If the user already has a valid session and board, the app restores it instead of forcing setup again.
4. **See the product promise.** The first welcome page explains the relationship problem. The user swipes into the board-access page.
5. **Continue with Apple.** Homeboard uses a narrow Apple-only account path. Hidden Apple relay addresses are supported.
6. **Start a board.** A new owner begins a search and creates the group’s workspace.
7. **Build the rental brief.** The owner enters the city, group size, personal budget, move timing, commute destination or remote-work status, transportation options, preferred commute range, neighborhoods, priorities, must-haves, dealbreakers, and readiness.
8. **Enter the workspace.** The app opens on the Search tab with a first-use guide and a clear next action.
9. **Save the first real rental.** The owner opens an exact listing in Safari, shares it to Homeboard, watches the page scan, reviews the extracted facts, corrects anything uncertain, and saves it.
10. **Invite the group.** The owner creates and shares a secure board link. The link is revocable, replaceable, expiring, single-use, and not locked to an email address.
11. **Build the shortlist.** The group saves more candidates, adds notes and reactions, and moves serious listings into touring, applied, passed, or other practical states.
12. **Compare and decide.** Homeboard brings listing facts, work destinations, route evidence, budgets, priorities, and roommate opinions into the comparison view. The group resolves open questions and records why it chose or rejected each home.

### Flow B: an invited roommate

1. **Receive a board link.** Messages, AirDrop, email, and other normal share channels can carry the invitation.
2. **Open the link.** If Homeboard is installed, the Universal Link hands the invitation to the app. If it is not installed, the user sees a branded web preview of the board and inviter, followed by the official install destination when configured.
3. **Install and reopen.** The invitation remains attached to the flow instead of requiring the user to find or re-enter an email invitation.
4. **Continue with Apple.** The link, not the email address, proves which board the user was invited to. This allows Sign in with Apple’s Hide My Email feature to work normally.
5. **Accept the board.** The app validates and redeems the invitation.
6. **Add a personal brief.** The roommate contributes their own budget, commute, neighborhood preferences, priorities, and dealbreakers.
7. **Join the ongoing search.** Existing listings and group context are available. The member can rate, react, comment, shortlist, reject, add updates, and help resolve tradeoffs.

### Flow C: connecting Safari on a Mac

1. **Open the Safari setup page.** The user can visit the website directly or tap “Send Mac setup link” inside the iPhone app and AirDrop or Message it to the Mac.
2. **Install Homeboard Safari Setup.** During development, the Xcode scheme is `Homeboard Safari Setup (Mac)` on `My Mac`. Public distribution will use the configured Mac beta or App Store link.
3. **Open the companion once.** Apple requires the containing Mac app to run before Safari can register the extension.
4. **Connect the account.** The Mac shows a short-lived QR code. In the iPhone app, the user opens Settings → Connect a Mac, scans the code, verifies the matching code, and approves the connection. Apple sign-in is available as a fallback.
5. **Choose a board.** The companion stores the active destination for Safari saves.
6. **Enable the extension.** The companion opens Safari Settings. The user switches Homeboard on; Apple requires this explicit approval and does not permit Homeboard to bypass it.
7. **Save from desktop Safari.** On a supported rental page, the user clicks the Homeboard toolbar button, reviews the captured facts, and saves the listing. It appears on the same board as the iPhone app.

### The recurring daily loop

After setup, Homeboard’s intended habit is:

**Find elsewhere → save to Homeboard → review the facts → discuss together → compare the tradeoff → update the decision.**

The three main tabs support that loop:

- **Search:** The active map, listings, work destinations, routes, and discovery context.
- **Shortlist:** The serious contenders and their current stage.
- **Updates:** The shared history of what changed and what the group is thinking.

Compare, People, invitations, the rental brief, and other setup tools sit behind those primary surfaces so the daily navigation stays smaller than the full capability set.

## Current product state

Homeboard’s core product loop is implemented:

**Align the group → collect exact rentals → review facts → compare tradeoffs → discuss → decide.**

The build is suitable for a small internal TestFlight cohort after the remaining real-device gates pass. It is not yet ready for uncontrolled external distribution.

The most important open issues are:

- Proving first-time, returning, canceled, hidden-email, revoked-session, and account-deletion cases with real Apple accounts.
- Running the complete invitation and collaboration flow repeatedly on two physical devices.
- Testing representative rental pages across the supported Safari sites and failure states.
- Adding a visible sync state and choosing a documented realtime or foreground-refresh strategy.
- Deciding whether beta notifications include a production server sender. Device permission and token registration exist today; live delivery does not.
- Adding production crash reporting, structured error monitoring, backup/restore rehearsal, and operational alerts.
- Finalizing Terms, privacy commitments, a monitored support channel, App Store Connect records, and official install links.

## Expansion plan

Expansion should protect the product’s central advantage. Homeboard should deepen the shared decision before it broadens into more inventory or more platforms.

### Stage 1: prove the private beta

**Goal:** Demonstrate that a small real group can use Homeboard throughout an actual rental search.

Priorities:

- Complete the Apple sign-in and account-deletion test matrix.
- Pass the two-device collaboration script repeatedly, including offline recovery.
- Complete the cross-site Safari import test set.
- Add crash reporting, structured operational monitoring, backups, and restore testing.
- Configure TestFlight, official iPhone and Mac install links, support, privacy, and terms.
- Run a small internal cohort and measure where users abandon setup or stop saving listings.

### Stage 2: make the core decision loop effortless

**Goal:** Reduce the amount of explanation and refreshing required once several people and listings are active.

Planned improvements:

- Clear saved, syncing, retrying, failed, and stale states.
- Realtime or well-explained foreground board refresh and unread activity.
- Stronger labels showing whether a comparison fact came from the listing, a route provider, a roommate, or model-assisted analysis.
- A simpler side-by-side view for two or three serious finalists.
- Easier editing of work destinations and commute limits directly from comparison.
- Better empty states, unsupported-site guidance, invite failure recovery, accessibility, and reduced-motion support.
- Compact comparison summaries that can be shared back into a group chat without losing the Homeboard decision context.

### Stage 3: broaden capture and distribution

**Goal:** Let users add a serious rental from wherever they find it.

Likely directions:

- Public iPhone and Mac App Store distribution.
- More reliable capture across additional broker and rental sites.
- A Chrome/Edge companion after the Safari workflow is stable and validated.
- Better native sharing from listing apps that expose only a URL and title.
- Saved comparison presets for different work, school, or lifestyle scenarios.
- Expansion from the initial New York use case into other commute-sensitive rental markets.

### Stage 4: add selective discovery

**Goal:** Help groups find credible candidates without turning Homeboard into another undifferentiated listing portal.

This stage should begin only after the collaboration loop is proven. It may include:

- A licensed listing-data provider behind a controlled server flag.
- Verified, attributable inventory with exact units and reliable removal behavior.
- Price history, availability changes, and alerts tied to existing board criteria.
- Carefully ranked suggestions that remain separate from the group’s real shortlist until a member saves them.

The product should never fabricate inventory, hide the original source, or allow recommendation cards to masquerade as exact listings.

### Stage 5: support the full decision lifecycle

**Goal:** Preserve useful group context from early browsing through application and final choice.

Possible later additions include:

- Tour coordination and shared availability.
- Application-readiness checklists.
- Decision summaries explaining why the group chose one home.
- Exportable board archives for users who want a record after the search ends.
- Carefully scoped partner integrations, provided they do not compromise user trust or turn the product into an advertising feed.

## Recommended measures of success

The beta should measure whether Homeboard improves a real decision, not simply whether people open the app.

Useful product measures include:

- Percentage of new owners who finish a usable rental brief.
- Time from install to first verified listing.
- Percentage of boards that successfully add a second member.
- Listings saved and reviewed per active board.
- Percentage of serious listings with input from more than one member.
- Number of open tradeoffs that receive a recorded resolution.
- Import success rate by source and device.
- Board-sync failures, retries, and stale-state reports.
- Percentage of active boards that reach a touring, applied, or selected state.
- User reports that Homeboard reduced repeated discussion or made a compromise clearer.

## Product principles for expansion

1. **The source stays visible.** A user should always know where a listing fact came from.
2. **Uncertainty stays visible.** Missing or model-assisted information should not be presented as verified fact.
3. **The group remains in control.** Homeboard explains and organizes; it does not make an irreversible choice for the users.
4. **Collaboration comes before inventory scale.** A small set of real candidates with honest context is more valuable than hundreds of weak suggestions.
5. **Private by default.** Boards, personal constraints, and group decisions should remain limited to invited members.
6. **Expansion must shorten the path to a decision.** Features that only increase browsing volume are not automatically progress.

## Conclusion

Homeboard’s opportunity is not to become the internet’s largest apartment catalog. Its opportunity is to become the place where a rental group finally understands its options.

The current product already demonstrates that idea across iPhone, Safari, Mac, web sharing, and a real shared backend. The next step is disciplined validation: prove that the flow survives real accounts, changing listing sites, unreliable networks, and an actual group search. Once that foundation is trusted, Homeboard can expand across platforms, markets, capture sources, and selective listing discovery without losing the clear product thesis that makes it different.

**Homeboard turns “here are twenty-seven links” into “here is the home that works, the compromises it asks for, and the decision we made together.”**
