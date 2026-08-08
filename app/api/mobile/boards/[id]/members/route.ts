import { NextResponse } from "next/server";
import { z } from "zod";

import { addRoommateToBoard, getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  budgetMin: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  idealBudget: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  budgetMax: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  stretchBudget: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  commuteDestination: z.string().trim().max(240).optional(),
  commuteAccess: z.enum(["car", "transit", "flexible", "remote", "skip"]).nullable().optional(),
  preferredCommuteMinutes: z.number().int().min(0).max(300).nullable().optional(),
  maxCommuteMinutes: z.number().int().min(1).max(300).nullable().optional(),
  petsRequired: z.boolean().nullable().optional(),
  accessibilityNeeds: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const current = await getBoardPageData(id, user.id);
    if (!current) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid member profile." }, { status: 400 });
    await addRoommateToBoard(id, {
      name: parsed.data.name,
      budgetMin: parsed.data.budgetMin == null ? undefined : String(parsed.data.budgetMin),
      idealBudget: parsed.data.idealBudget == null ? undefined : String(parsed.data.idealBudget),
      budgetMax: parsed.data.budgetMax == null ? undefined : String(parsed.data.budgetMax),
      stretchBudget: parsed.data.stretchBudget == null ? undefined : String(parsed.data.stretchBudget),
      commuteDestination: parsed.data.commuteDestination,
      commuteAccess: parsed.data.commuteAccess ?? undefined,
      preferredCommuteMinutes:
        parsed.data.preferredCommuteMinutes == null ? undefined : String(parsed.data.preferredCommuteMinutes),
      maxCommuteMinutes: parsed.data.maxCommuteMinutes == null ? undefined : String(parsed.data.maxCommuteMinutes),
      petsRequired:
        parsed.data.petsRequired === undefined
          ? undefined
          : parsed.data.petsRequired === null
            ? ""
            : String(parsed.data.petsRequired),
      accessibilityNeeds: parsed.data.accessibilityNeeds,
    });
    const next = await getBoardPageData(id, user.id);
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({ board: buildMobileBoardPayload(next), profile: next.profile, missingFields: next.missingFields });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add member.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
