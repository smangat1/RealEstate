# Advisor outcome memory

Advisor memory changes draft defaults without changing accepted drafts, preferences, or outreach state.

## What is stored

Per-user outcome records live only in a separate, versioned `UserDefaults` value on the device. Each record contains a user, board, listing and message identifier; template identifier; tone; reported outcome; optional reason code; and timestamp. It never contains draft text, broker messages, screenshots, or financial values. Corrupt or unknown-version data is ignored without affecting the app's other persisted state.

The server does not gain a memory table or API. Existing board-scoped `AdvisorFeedback` draft signals may be summarized into counts. A missing table (`P2021`), an empty table, or any query failure produces an empty summary and does not fail the draft path.

## Deterministic selection

The current default remains Professional with the standard availability template until at least three distinct relevant drafts exist, so one draft moving through accepted, sent and replied cannot change the default by itself. Listing-specific history is preferred once it has three distinct drafts; otherwise the board's current user's history is used. Each draft/template/tone variant contributes only its latest outcome: reported replies and sends rank up, acceptance ranks up slightly, while stale, rejected, and revised outcomes rank down. A `bad_tone` reason adds a tone penalty. Existing board feedback is aggregate-only and uses the same three-distinct-subject guard.

The user's explicit tone selection always wins. Equal scores resolve in the documented fixed tone/template order, so identical inputs replay identically. The card explains a changed default in one short line and still exposes the tone controls.

## Context and privacy boundary

The on-device language model receives only a bounded, non-financial summary: selected listing label, non-financial board requirements, conversation stage, metadata-only listing history, and compact reported outcome labels. Budget, income, credit, application readiness, prior draft text, broker replies, and screenshots are excluded. Financial disclosure remains app-owned and is inserted only after model-output validation.

## Inspection and reset

In a debug build, inspect the `homeboard.native.advisor-outcome-memory.v1` `UserDefaults` value. It is a schema-versioned JSON envelope. `AdvisorOutcomeMemory.clear(userId:boardId:)` can clear one user's board history, one user's history, one board scope, or the entire memory value. UI-test reset clears it independently of the account-state persistence blobs.
