import { NextResponse } from "next/server";
import { z } from "zod";

import { getBoardPageData, renameBoard, saveBoardProfile } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { createOnboardingDraftProfile } from "@/lib/onboarding-flow";
import type { RentalProfile } from "@/lib/types";

const rentalReadinessSchema = z
  .object({
    hasOfferLetter: z.boolean().optional(),
    needsGuarantor: z.boolean().optional(),
    hasProofOfIncome: z.boolean().optional(),
  })
  .partial();

const profileSchema = z.object({
  id: z.string().min(0).max(120).optional(),
  boardId: z.string().min(0).max(120).optional(),
  name: z.string().max(160),
  email: z.string().email().optional(),
  city: z.string().max(160).optional(),
  moveInDate: z.string().max(120).optional(),
  budgetMin: z.number().finite().nonnegative().optional(),
  budgetMax: z.number().finite().nonnegative().optional(),
  stretchBudget: z.number().finite().nonnegative().optional(),
  neighborhoods: z.array(z.string().max(120)).max(20),
  commuteTarget: z.string().max(160).optional(),
  commuteAccess: z.enum(["car", "transit", "flexible", "remote", "skip"]).optional(),
  minCommuteMinutes: z.number().int().nonnegative().max(300).optional(),
  maxCommuteMinutes: z.number().int().nonnegative().max(300).optional(),
  mustHaves: z.array(z.string().max(120)).max(30),
  dealbreakers: z.array(z.string().max(120)).max(30),
  niceToHaves: z.array(z.string().max(120)).max(30),
  priorities: z.array(z.string().max(120)).max(20),
  pets: z.boolean().optional(),
  parking: z.boolean().optional(),
  groupSize: z.number().int().positive().max(20).optional(),
  hasRoommates: z.boolean().optional(),
  rentalReadiness: rentalReadinessSchema.optional(),
  completionStatus: z.enum(["incomplete", "complete", "confirmed"]),
  notes: z.string().max(5000).nullable().optional(),
  createdAt: z.string().max(80),
  updatedAt: z.string().max(80),
  intent: z.enum(["rent", "buy"]).nullable().optional(),
  propertyType: z.enum(["apartment", "house", "condo", "room", "unknown"]).nullable().optional(),
  locations: z.array(z.string().max(160)).max(20),
  bedroomsPreferred: z.number().int().nonnegative().max(20).nullable().optional(),
  bedroomsFlexible: z.array(z.string().max(80)).max(20),
  moveInTimeframe: z.string().max(120).nullable().optional(),
  petsRequired: z.boolean().nullable().optional(),
  parkingRequired: z.boolean().nullable().optional(),
  laundryRequired: z.boolean().nullable().optional(),
});

const boardTitleSchema = z.object({ title: z.string().trim().min(1).max(160) });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const boardData = await getBoardPageData(id, user.id, { includeSuggestedListings: false });

    if (!boardData) {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    return NextResponse.json({
      board: buildMobileBoardPayload(boardData),
      profile: boardData.profile,
      completion: boardData.completion,
      missingFields: boardData.missingFields,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const rawBody = await request.json().catch(() => null);
    const parsed = profileSchema.safeParse(rawBody?.profile);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid profile payload." }, { status: 400 });
    }

    const profile: RentalProfile = {
      ...createOnboardingDraftProfile({
        name: parsed.data.name || user.displayName,
        email: parsed.data.email || user.email,
      }),
      ...parsed.data,
      id: parsed.data.id || "mobile-profile",
      boardId: parsed.data.boardId || id,
      name: parsed.data.name || user.displayName,
      email: parsed.data.email || user.email,
    };

    await saveBoardProfile(id, user.id, profile);
    const boardData = await getBoardPageData(id, user.id, { includeSuggestedListings: false });

    if (!boardData) {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    return NextResponse.json({
      board: buildMobileBoardPayload(boardData),
      profile: boardData.profile,
      completion: boardData.completion,
      missingFields: boardData.missingFields,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save board brief.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireMobileAppUser(request);
    const { id } = await context.params;
    const current = await getBoardPageData(id, user.id, { includeSuggestedListings: false });
    if (!current) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    const parsed = boardTitleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid board title." }, { status: 400 });
    await renameBoard(id, user.id, parsed.data.title);
    const next = await getBoardPageData(id, user.id, { includeSuggestedListings: false });
    if (!next) return NextResponse.json({ error: "Board not found." }, { status: 404 });
    return NextResponse.json({ board: buildMobileBoardPayload(next), profile: next.profile, missingFields: next.missingFields });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to rename board.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
