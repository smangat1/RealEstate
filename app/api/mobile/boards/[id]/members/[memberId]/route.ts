import { NextResponse } from "next/server";
import { z } from "zod";

import { getBoardPageData, removeBoardMember, removeRoommateProfile, updateRoommateProfile } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";

const schema = z.object({
  budgetMin: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  idealBudget: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  budgetMax: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  stretchBudget: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  commuteDestination: z.string().trim().max(240).optional(),
  commuteAccess: z.enum(["car", "transit", "flexible", "remote", "skip"]).nullable().optional(),
  preferredCommuteMinutes: z.number().int().min(0).max(300).nullable().optional(),
  maxCommuteMinutes: z.number().int().min(1).max(300).nullable().optional(),
  commutePriority: z.enum(["low", "medium", "high"]).optional(),
  neighborhoodPriority: z.enum(["low", "medium", "high"]).optional(),
  spacePriority: z.enum(["low", "medium", "high"]).optional(),
  privacyPriority: z.enum(["low", "medium", "high"]).optional(),
  preferredNeighborhoods: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  mustHaves: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  dealbreakers: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  petsRequired: z.boolean().nullable().optional(),
  accessibilityNeeds: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
});

async function boardResponse(boardId: string, userId: string) {
  const next = await getBoardPageData(boardId, userId);
  if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
  return NextResponse.json({ board: buildMobileBoardPayload(next), profile: next.profile, missingFields: next.missingFields });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, memberId } = await context.params;
    const current = await getBoardPageData(id, user.id);
    if (!current) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const roommate = current.roommates.find((entry) => entry.id === memberId);
    if (!roommate) return NextResponse.json({ error: "Member profile not found." }, { status: 404 });
    if (roommate.linkedUserId && roommate.linkedUserId !== user.id) {
      return NextResponse.json({ error: "Each member controls their own budget and commute profile." }, { status: 403 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid member update." }, { status: 400 });
    await updateRoommateProfile(memberId, {
      budgetMin:
        parsed.data.budgetMin === undefined ? undefined : parsed.data.budgetMin === null ? "" : String(parsed.data.budgetMin),
      idealBudget:
        parsed.data.idealBudget === undefined
          ? undefined
          : parsed.data.idealBudget === null
            ? ""
            : String(parsed.data.idealBudget),
      budgetMax:
        parsed.data.budgetMax === undefined ? undefined : parsed.data.budgetMax === null ? "" : String(parsed.data.budgetMax),
      stretchBudget:
        parsed.data.stretchBudget === undefined
          ? undefined
          : parsed.data.stretchBudget === null
            ? ""
            : String(parsed.data.stretchBudget),
      commuteDestination: parsed.data.commuteDestination,
      commuteAccess:
        parsed.data.commuteAccess === undefined
          ? undefined
          : parsed.data.commuteAccess ?? "",
      preferredCommuteMinutes:
        parsed.data.preferredCommuteMinutes === undefined
          ? undefined
          : parsed.data.preferredCommuteMinutes === null
            ? ""
            : String(parsed.data.preferredCommuteMinutes),
      maxCommuteMinutes:
        parsed.data.maxCommuteMinutes === undefined
          ? undefined
          : parsed.data.maxCommuteMinutes === null
            ? ""
            : String(parsed.data.maxCommuteMinutes),
      commutePriority: parsed.data.commutePriority,
      neighborhoodPriority: parsed.data.neighborhoodPriority,
      spacePriority: parsed.data.spacePriority,
      privacyPriority: parsed.data.privacyPriority,
      preferredNeighborhoods: parsed.data.preferredNeighborhoods?.join(", "),
      mustHaves: parsed.data.mustHaves?.join(", "),
      dealbreakers: parsed.data.dealbreakers?.join(", "),
      petsRequired:
        parsed.data.petsRequired === undefined
          ? undefined
          : parsed.data.petsRequired === null
            ? ""
            : String(parsed.data.petsRequired),
      accessibilityNeeds: parsed.data.accessibilityNeeds,
      notes: parsed.data.notes,
    });
    return boardResponse(id, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update member.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id, memberId } = await context.params;
    const current = await getBoardPageData(id, user.id);
    if (!current) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    if (current.board.userId !== user.id) return NextResponse.json({ error: "Only the board owner can remove members." }, { status: 403 });
    const roommate = current.roommates.find((entry) => entry.id === memberId);
    if (!roommate) return NextResponse.json({ error: "Member profile not found." }, { status: 404 });
    if (roommate.linkedUserId) await removeBoardMember(id, user.id, roommate.linkedUserId);
    else await removeRoommateProfile(memberId);
    return boardResponse(id, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove member.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
