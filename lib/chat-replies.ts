export type ChatReplyTarget = {
  id: string;
  boardId: string;
  role: string;
  hasAdvisorPayload: boolean;
};

export type ChatReplyRouting = {
  isAdvisorRequest: boolean;
  isImplicitAdvisorRequest: boolean;
  engineCommand: string;
};

export class InvalidChatReplyTargetError extends Error {
  constructor() {
    super("Reply target is invalid for this board.");
    this.name = "InvalidChatReplyTargetError";
  }
}

export function validateChatReplyTarget(
  boardId: string,
  replyToMessageId: string | undefined,
  target: ChatReplyTarget | null,
) {
  if (!replyToMessageId) return null;
  if (!target || target.id !== replyToMessageId || target.boardId !== boardId) {
    throw new InvalidChatReplyTargetError();
  }
  return target;
}

export function routeChatReply(content: string, target: ChatReplyTarget | null): ChatReplyRouting {
  const trimmed = content.trim();
  const explicitAdvisor = /^@advisor\b/i.test(trimmed);
  const implicitAdvisor = !explicitAdvisor
    && target?.role === "assistant"
    && target.hasAdvisorPayload;
  return {
    isAdvisorRequest: explicitAdvisor || implicitAdvisor,
    isImplicitAdvisorRequest: implicitAdvisor,
    engineCommand: implicitAdvisor ? `@advisor ${trimmed}` : trimmed,
  };
}

type ReplyRow = { messageId: string; replyToMessageId: string };

export async function loadChatReplyLinks(input: {
  boardId: string;
  messageIds: string[];
  query: (args: {
    where: { boardId: string; messageId: { in: string[] } };
    select: { messageId: true; replyToMessageId: true };
  }) => Promise<ReplyRow[]>;
  diagnostic?: (event: "chat_reply_read_unavailable") => void;
}) {
  if (input.messageIds.length === 0) return new Map<string, string>();
  try {
    const rows = await input.query({
      where: { boardId: input.boardId, messageId: { in: input.messageIds } },
      select: { messageId: true, replyToMessageId: true },
    });
    return new Map(rows.map((row) => [row.messageId, row.replyToMessageId]));
  } catch {
    input.diagnostic?.("chat_reply_read_unavailable");
    return new Map<string, string>();
  }
}

export async function storeChatReplyLink(input: {
  boardId: string;
  messageId: string;
  replyToMessageId?: string;
  create: (args: {
    data: { boardId: string; messageId: string; replyToMessageId: string };
  }) => Promise<unknown>;
  diagnostic?: (event: "chat_reply_write_unavailable") => void;
}) {
  if (!input.replyToMessageId) return true;
  try {
    await input.create({
      data: {
        boardId: input.boardId,
        messageId: input.messageId,
        replyToMessageId: input.replyToMessageId,
      },
    });
    return true;
  } catch {
    input.diagnostic?.("chat_reply_write_unavailable");
    return false;
  }
}
