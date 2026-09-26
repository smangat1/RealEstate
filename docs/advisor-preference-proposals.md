# Advisor preference proposal boundary

Advisor preference extraction is a suggestion pipeline, not a mutation pipeline.
The iOS app analyzes ordinary board chat on device with Apple Intelligence when
the system model is available. Unsupported devices and model failures use the
bounded deterministic parser. No server route calls a language model.

The client sends at most four typed signals. The envelope is tied to the exact
board id, client-generated message UUID, and last board revision the sender saw.
It contains an allowed feature key, an allowed weight, an exact evidence span,
and either `preference` or `remove_must_have`. It contains no free-form changes.

## Eligibility threshold

There is intentionally no numerical confidence threshold. Foundation Models does
not provide a calibrated confidence value for this task, so Homeboard does not
invent one. A signal is eligible only when all deterministic evidence checks pass:

- the statement is explicit, current, and first-person;
- its evidence occurs in the exact persisted message;
- the feature, weight, and intent are from the bounded schema;
- the message is not uncertain, quoted, hypothetical, third-party, shared/group,
  or internally conflicting;
- a must-have removal explicitly says that named requirement is no longer needed
  or should be removed from the sender's must-haves.

The server validates the schema, authenticated board membership, current board
revision, message id, persisted message ownership/content, affected roommate,
and the same evidence semantics. Stale or invalid candidates create no proposal.
Candidates never update durable preferences.

Valid candidates stage the existing before/after review card. Only the affected
roommate can accept or reject it. Acceptance uses the roommate profile timestamp
as an optimistic lock, so a competing preference edit expires the old proposal
instead of overwriting newer state. Rejection and no response leave preferences
unchanged.
