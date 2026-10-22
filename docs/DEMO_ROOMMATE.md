# App Review demo roommate

This opt-in script adds one fictional, non-login user named `Demo Roommate` and three harmless chat messages to the App Review board. It does not create an email address, Supabase identity, or Apple identity.

The script refuses to continue unless `DEMO_BOARD_INVITE_CODE` (default `REVIEW2026`) points to a pending reusable invitation for a board titled exactly `Demo Board`, owned and invited by `App Review` (`app-review@joinhomeboard.com`). It also refuses deterministic-ID or display-name collisions.

## Preview and apply

Both commands first print the exact plan. The first command is read-only. The second applies only missing rows, so it is safe to repeat.

```sh
npx tsx scripts/seed-demo-roommate.ts
npx tsx scripts/seed-demo-roommate.ts --confirm
```

Run these only against the intended App Review database. This repository change does not run either command.

## Undo

Preview the narrowly scoped undo, then confirm it:

```sh
npx tsx scripts/seed-demo-roommate.ts --undo
npx tsx scripts/seed-demo-roommate.ts --undo --confirm
```

Undo removes only the deterministic demo messages, board membership, roommate profile, and fake user created by this script. It applies the same board-owner and collision guards before writing.
