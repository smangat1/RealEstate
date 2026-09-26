import { Prisma } from "@prisma/client";

import { buildPreferenceProposal, type PreferenceProposalChange } from "@/lib/advisor-preference-proposals";
import {
  validatePreferenceCandidateSubmission,
  type PreferenceCandidate,
} from "@/lib/preference-candidate";
import { prisma } from "@/lib/prisma";

export type AdvisorPreferenceProposalPayload = {
  id: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  changes: Array<{
    field: string;
    label: string;
    before: string;
    after: string;
  }>;
  createdAt: string;
};

function displayValue(value: PreferenceProposalChange["oldValue"]) {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "None";
  if (value === null) return "Not set";
  if (typeof value === "number") {
    if (value >= 2) return "Strong preference";
    if (value === 1) return "Preferred";
    if (value === -1) return "Lower priority";
    if (value <= -2) return "Not important";
  }
  return String(value);
}

export function serializePreferenceProposal(proposal: {
  id: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  changes: Prisma.JsonValue;
  createdAt: Date;
}): AdvisorPreferenceProposalPayload | null {
  if (!Array.isArray(proposal.changes)) return null;
  const changes = proposal.changes.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const change = value as Record<string, unknown>;
    if (typeof change.field !== "string" || typeof change.label !== "string") return [];
    return [{
      field: change.field,
      label: change.label,
      before: displayValue(change.oldValue as PreferenceProposalChange["oldValue"]),
      after: displayValue(change.newValue as PreferenceProposalChange["newValue"]),
    }];
  });
  if (changes.length === 0) return null;
  return {
    id: proposal.id,
    status: proposal.status,
    changes,
    createdAt: proposal.createdAt.toISOString(),
  };
}

export async function stageAdvisorPreferenceProposal(input: {
  boardId: string;
  userId: string;
  authorName: string;
  sourceMessageId: string;
  content: string;
  boardRevision: string;
  candidate: PreferenceCandidate | null;
}) {
  if (!input.candidate) return null;
  const validation = validatePreferenceCandidateSubmission({
    candidate: input.candidate,
    boardId: input.boardId,
    messageId: input.sourceMessageId,
    boardRevision: input.boardRevision,
    content: input.content,
  });
  if (!validation.ok) return null;

  // The route has already established board membership. Re-read the persisted
  // message so a candidate cannot be replayed against another user's text.
  const sourceMessage = await prisma.chatMessage.findFirst({
    where: {
      id: input.sourceMessageId,
      boardId: input.boardId,
      authorUserId: input.userId,
      role: "user",
      content: input.content.trim(),
    },
    select: { id: true },
  });
  if (!sourceMessage) return null;

  const roommate = await prisma.roommateProfile.findFirst({
    where: { boardId: input.boardId, linkedUserId: input.userId, roleLabel: { not: "commute point" } },
    select: {
      id: true,
      updatedAt: true,
      commutePriority: true,
      neighborhoodPriority: true,
      spacePriority: true,
      privacyPriority: true,
      preferenceSignals: true,
      mustHaves: true,
    },
  });
  if (!roommate) return null;
  const changes = buildPreferenceProposal(roommate, validation.signals);
  if (changes.length === 0) return null;

  const [proposal] = await prisma.$transaction([
    prisma.advisorPreferenceProposal.create({
      data: {
        boardId: input.boardId,
        roommateId: roommate.id,
        userId: input.userId,
        sourceMessageId: input.sourceMessageId,
        baseProfileUpdatedAt: roommate.updatedAt,
        changes: changes as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.chatMessage.create({
      data: {
        boardId: input.boardId,
        role: "assistant",
        authorName: "Advisor",
        content: `I noticed a possible preference change for ${input.authorName}. Review the before/after proposal before anything changes.`,
      },
    }),
    prisma.boardEvent.create({
      data: {
        boardId: input.boardId,
        actorType: "assistant",
        actorName: "Advisor",
        eventType: "preference_change_proposed",
        content: `Advisor proposed ${changes.length} preference change${changes.length === 1 ? "" : "s"} for ${input.authorName}; nothing was applied.`,
      },
    }),
  ]);
  return serializePreferenceProposal(proposal);
}
