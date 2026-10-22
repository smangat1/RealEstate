export const contentReportReasons = [
  "spam",
  "harassment",
  "inappropriate",
  "threat",
  "other",
] as const;

export type ContentReportReason = (typeof contentReportReasons)[number];

type VisibleMessage = {
  id: string;
  role: string;
  authorUserId: string | null;
};

export function filterVisibleChatMessages<T extends VisibleMessage>(
  messages: T[],
  blockedUserIds: ReadonlySet<string>,
  reportedMessageIds: ReadonlySet<string>,
) {
  return messages.filter((message) => (
    message.role !== "user"
    || (
      !reportedMessageIds.has(message.id)
      && (!message.authorUserId || !blockedUserIds.has(message.authorUserId))
    )
  ));
}

export function canModerateMessage(input: {
  reporterUserId: string;
  message: { role: string; authorUserId: string | null };
}) {
  return input.message.role === "user"
    && Boolean(input.message.authorUserId)
    && input.message.authorUserId !== input.reporterUserId;
}

export function shareBoardWhere(leftUserId: string, rightUserId: string) {
  return {
    AND: [
      {
        OR: [
          { userId: leftUserId },
          { members: { some: { userId: leftUserId } } },
        ],
      },
      {
        OR: [
          { userId: rightUserId },
          { members: { some: { userId: rightUserId } } },
        ],
      },
    ],
  };
}
