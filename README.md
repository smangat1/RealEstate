# Homeboard

Homeboard is a shared rental workspace for roommate groups and co-searchers. The product is designed to replace scattered texts, screenshots, and loose apartment links with one structured search brief, one shared shortlist, one inviteable workspace, and one place to weigh commute, neighborhood, budget, and lifestyle tradeoffs together.

## Current product shape

Homeboard currently includes:

- Supabase-backed auth with real accounts, email-bound invites, and shared workspace membership
- Chat-led onboarding that builds a structured rental profile instead of forcing one big form upfront
- Shared workspace surfaces for:
  - group brief and readiness
  - member preference cards
  - shortlist, comments, and votes
  - activity history
  - invite management
- Listing flows for:
  - pasted links
  - pasted text
  - manual/demo-backed inventory
- Commute-aware matching architecture with live OpenRouteService support when configured
- Local Ollama support for onboarding and reasoning when local AI is enabled
- Operator-only runtime diagnostics and analytics export for beta operations

## Stack

- Next.js App Router
- TypeScript
- Prisma
- Supabase Auth + Postgres
- Ollama for local AI
- OpenRouteService for commute timing

## Local setup

1. Install dependencies.

```bash
npm install
```

2. Create your local env file.

```bash
cp .env.example .env.local
```

3. Fill in `.env.local`.

Required for the real beta-style app:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `DATABASE_URL`

Recommended depending on what you want active:

- `OLLAMA_URL` if your local Ollama host is not the default
- `OLLAMA_MODEL`
- `OLLAMA_EXTRACT_MODEL`
- `OLLAMA_REPLY_MODEL`
- `OPENROUTESERVICE_API_KEY` for live commute timing
- `HOMEBOARD_OPERATOR_EMAILS` as a comma-separated allowlist for operator-only controls
- `HOMEBOARD_NOINDEX=false` only when you are ready for the site to be crawlable

Optional runtime flags:

- `DEMO_MODE=true` to use deterministic scripted onboarding and staged listings
- `ENABLE_APP=false` to disable the live product surface entirely

4. If you want local AI, make sure Ollama is running and the models you reference are available.

5. Start the app.

```bash
npm run dev
```

6. Open the app.

```text
http://localhost:3000
```

## What to test

- Create a real account and sign in
- Start onboarding from the signed-in home surface
- Build a brief conversationally with city, roommates, budget, move-in timing, commute, priorities, and dealbreakers
- Confirm the brief and create a workspace
- Invite another person by email
- Open the invite route as the invited identity and accept the invite
- Update member preferences and commute anchors
- Add listings, vote, comment, and compare tradeoffs
- Export analytics as an operator account from settings
- Open the operator runtime JSON endpoint to verify env and service state without relying on the UI alone

## Demo and staged inventory

If you want the scripted, no-AI flow, enable:

```text
DEMO_MODE=true
```

In demo mode:

- onboarding uses deterministic scripted logic
- listings can come from the staged demo catalog
- commute can fall back to demo values

If you want to curate staged listings and photos:

- edit `lib/demo-properties.ts`
- place local images in `public/demo-properties/`

## Legacy dummy-data tooling

The repository still includes large dummy-data generation scripts from the earlier prototype phase. They are useful for stress-testing UI density and seeded scenarios, but they are no longer the primary way this app is expected to run for external beta.

Available commands:

```bash
npm run db:seed
npm run db:seed:large
npm run db:seed:huge
```

You can also customize generation directly:

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

## Notes

- Homeboard does not browse the web or scrape listing sites.
- Mixed listing sources are supported structurally, including `manual`, `pasted_link`, `pasted_text`, and future API-fed listings.
- Live commute timing only turns on when `OPENROUTESERVICE_API_KEY` is configured.
- Operator-only controls like runtime diagnostics and analytics export are gated by `HOMEBOARD_OPERATOR_EMAILS`.
