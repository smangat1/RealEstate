# Shared Rental Board MVP

This pass focuses on the shared-board version of the product: roommates define group limits in chat, keep individual preference cards on the board, react to listings together, and pressure-test compromise options before any real backend or external data integration lands.

## What is here

- `app/`
  Next.js app router UI for:
  - chat-first board creation
  - shared board view with roommate cards
  - conversational group preference flow
  - full-screen match deck with batch requests
  - listing add flows
  - saved shortlist with votes and comments
  - activity history and compromise summary
- `lib/`
  Local SQLite data access and mock advisor logic
- `scripts/generate-dummy-data.ts`
  Creates a normalized SQLite database with:
  - users
  - search boards
  - search profiles
  - roommate profiles
  - listings
  - board-to-listing joins
  - listing votes
  - listing comments
  - board events
  - price history
  - chat messages
- `prisma/schema.prisma`
  Keeps the intended application data model visible for the later ORM-backed app layer.

## Run the app locally

1. Install dependencies:

```bash
npm install
```

2. Generate data:

```bash
npm run db:seed:large
```

3. Start the app:

```bash
npm run dev
```

If you want the scripted, no-AI demo flow, keep `DEMO_MODE="true"` in `.env.local`. In that mode the chat uses a deterministic product script from `lib/demo-chat.ts` instead of calling Ollama.

If you want to curate your own fake inventory with custom photos, edit:

`lib/demo-properties.ts`

If you want local images for those demo properties, place them in:

`public/demo-properties/`

4. Open:

```text
http://localhost:3000
```

## What to try

- Start from the home screen and type a group request instead of filling a rigid form.
- Send messages like:
  - `we want a cool neighborhood but commute still matters`
  - `three roommates and 2800 each max`
  - `actually one of us needs Midtown twice a week`
  - `show me 5 listings`
  - `give me more`
- Open the full-screen match deck and move through listings in fresh batches instead of one static pile.
- Update roommate cards directly on the board.
- Add votes and comments to listings so the shortlist reflects group opinion.
- Add a listing by:
  - pasting a link
  - pasting listing text
  - manual entry can be added next if needed
- Change listing statuses between `new`, `interested`, `maybe`, `rejected`, `toured`, and `applied`.
- Read the group summary and activity feed to see how the compromise is shifting.

## Database output

By default the script writes to:

`data/rental-advisor.db`

## Seed commands

Install dependencies:

```bash
npm install
```

Generate a small demo dataset:

```bash
npm run db:seed
```

Generate a larger working dataset:

```bash
npm run db:seed:large
```

Generate a stress-test dataset:

```bash
npm run db:seed:huge
```

## Custom generation

You can override the preset counts:

```bash
npx tsx scripts/generate-dummy-data.ts \
  --reset \
  --users 100 \
  --boards 600 \
  --listings 15000 \
  --minListingsPerBoard 20 \
  --maxListingsPerBoard 60 \
  --chatMessagesPerBoard 20 \
  --maxPriceHistoryEntries 10
```

You can also choose a custom output path:

```bash
npx tsx scripts/generate-dummy-data.ts --scale huge --reset --dbPath ./data/dev-ui-pass.db
```

## Current default large dataset shape

The verified `huge` preset currently generates:

- 80 users
- 450 search boards
- 450 search profiles
- 12,000 listings
- 16,456 board listings
- 53,715 price history rows
- 8,100 chat messages

## Notes

- The generator does not browse the web or scrape anything.
- Listings include mixed sources like `manual`, `pasted_link`, `pasted_text`, and placeholder `api`.
- JSON-like fields are stored as JSON strings in SQLite for this first pass so the UI can exercise realistic shapes immediately.
