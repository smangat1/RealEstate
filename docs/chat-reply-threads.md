# Board chat reply threads

Board chat replies store only a source message id, the replied-to message id, the board id, and a timestamp. Quoted text is resolved from the existing board messages at read/render time; it is never copied into the reply row.

`ChatMessageReply` is deliberately separate from `ChatMessage`. This keeps ordinary chat reads compatible while the additive migration is pending. Reads and writes are best-effort, so an environment without the table continues sending messages but omits reply quotes.

The migration in `prisma/migrations/20261005120000_chat_message_replies/` is intentionally **not applied by this PR**. Sam must apply it through `docs/PRODUCTION_MIGRATION_RUNBOOK.md` before relying on persisted reply links.

This feature is unrelated to the existing broker reply-intake types named `AdvisorReplyThread`. It adds no reply notifications, instruction parsing, or automatic broker sends.
