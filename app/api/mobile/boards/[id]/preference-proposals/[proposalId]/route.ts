import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  preferenceUpdateFromChanges,
  preferenceProposalResolution,
  type PreferenceProposalChange,
} from "@/lib/advisor-preference-proposals";
import { getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({ action: z.enum(["accept", "reject"]) }).strict();
const valueSchema = z.union([z.string(), z.number(), z.array(z.string()), z.null()]);
const changeSchema = z.object({
  field: z.string().min(1),
  label: z.string().min(1),
  oldValue: valueSchema,
  newValue: valueSchema,
}).strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; proposalId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, proposalId } = await context.params;
    const body = requestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "Invalid preference proposal action." }, { status: 400 });
    const board = await getBoardPageData(id, user.id, { includeSuggestedListings: false, includeCommutes: false });
    if (!board) return NextResponse.json({ error: "Board not found." }, { status: 404 });

    const result = await prisma.$transaction(async (transaction) => {
      const proposal = await transaction.advisorPreferenceProposal.findFirst({
        where: { id: proposalId, boardId: id, userId: user.id },
      });
      if (!proposal) return { kind: "missing" as const };
      const roommate = await transaction.roommateProfile.findFirst({
        where: { id: proposal.roommateId, boardId: id, linkedUserId: user.id },
      });
      const resolution = preferenceProposalResolution({
        status: proposal.status,
        action: body.data.action,
        baseVersion: proposal.baseProfileUpdatedAt.getTime(),
        currentVersion: roommate?.updatedAt.getTime() ?? -1,
      });
      if (resolution === "resolved") return { kind: "resolved" as const };

      if (resolution === "rejected") {
        await transaction.advisorPreferenceProposal.update({
          where: { id: proposal.id },
          data: { status: "rejected", resolvedAt: new Date() },
        });
        await transaction.boardEvent.create({
          data: {
            boardId: id,
            actorType: "roommate",
            actorName: user.displayName,
            eventType: "preference_change_rejected",
            content: `${user.displayName} rejected an Advisor preference proposal. No preferences changed.`,
          },
        });
        return { kind: "rejected" as const };
      }

      if (resolution === "stale" || !roommate) {
        await transaction.advisorPreferenceProposal.update({
          where: { id: proposal.id },
          data: { status: "expired", resolvedAt: new Date() },
        });
        return { kind: "stale" as const };
      }
      const changes = z.array(changeSchema).safeParse(proposal.changes);
      if (!changes.success) return { kind: "invalid" as const };
      const update = preferenceUpdateFromChanges(roommate, changes.data as PreferenceProposalChange[]);
      const applied = await transaction.roommateProfile.updateMany({
        where: { id: roommate.id, updatedAt: proposal.baseProfileUpdatedAt },
        data: update as Prisma.RoommateProfileUpdateManyMutationInput,
      });
      if (applied.count === 0) {
        await transaction.advisorPreferenceProposal.update({
          where: { id: proposal.id },
          data: { status: "expired", resolvedAt: new Date() },
        });
        return { kind: "stale" as const };
      }
      await transaction.advisorPreferenceProposal.update({
        where: { id: proposal.id },
        data: { status: "accepted", resolvedAt: new Date() },
      });
      await transaction.chatMessage.create({
        data: {
          boardId: id,
          role: "assistant",
          authorName: "Advisor",
          content: `${user.displayName} confirmed ${changes.data.length} preference change${changes.data.length === 1 ? "" : "s"}.`,
        },
      });
      await transaction.boardEvent.create({
        data: {
          boardId: id,
          actorType: "roommate",
          actorName: user.displayName,
          eventType: "preference_change_confirmed",
          content: `${user.displayName} confirmed an Advisor preference proposal after reviewing the before/after values.`,
        },
      });
      return { kind: "accepted" as const };
    });

    if (result.kind === "missing") return NextResponse.json({ error: "Preference proposal not found." }, { status: 404 });
    if (result.kind === "resolved") return NextResponse.json({ error: "Preference proposal was already resolved." }, { status: 409 });
    if (result.kind === "stale") {
      return NextResponse.json({
        error: "Preferences changed after this proposal was created. Review a new proposal instead.",
        code: "PREFERENCE_PROPOSAL_STALE",
      }, { status: 409 });
    }
    if (result.kind === "invalid") return NextResponse.json({ error: "Preference proposal is invalid." }, { status: 422 });

    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({
      board: buildMobileBoardPayload(next),
      profile: next.profile,
      missingFields: next.missingFields,
      preferenceProposal: null,
    });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json(
      { error: unauthorized ? "Unauthorized" : "Unable to resolve preference proposal." },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
