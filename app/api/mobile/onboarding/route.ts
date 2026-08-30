import { NextResponse } from "next/server";
import { z } from "zod";

import { createBoardAndReturnId, getBoardPageData } from "@/lib/board-data";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { buildMobileBoardPayload } from "@/lib/mobile-payloads";
import { createOnboardingDraftProfile } from "@/lib/onboarding-flow";
import {
  applyMessageToProfile,
  finalizeProfileState,
  generateAssistantReply,
  getConversationHint,
  getProfileCompletion,
} from "@/lib/rental-logic";
import type { ChatMessage, SearchProfileData } from "@/lib/types";

const profileSchema = z.object({
  id: z.string().max(120).optional(), boardId: z.string().max(120).optional(), name: z.string().max(160), email: z.string().email().optional(),
  city: z.string().max(160).optional(), moveInDate: z.string().max(120).optional(), budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(), stretchBudget: z.number().nonnegative().optional(), neighborhoods: z.array(z.string().max(120)).max(30),
  commuteTarget: z.string().max(240).optional(), commuteAccess: z.enum(["car", "transit", "flexible", "remote", "skip"]).optional(), minCommuteMinutes: z.number().int().nonnegative().max(300).optional(), maxCommuteMinutes: z.number().int().nonnegative().max(300).optional(), mustHaves: z.array(z.string().max(120)).max(30),
  dealbreakers: z.array(z.string().max(120)).max(30), niceToHaves: z.array(z.string().max(120)).max(30), priorities: z.array(z.string().max(120)).max(20),
  pets: z.boolean().optional(), parking: z.boolean().optional(), groupSize: z.number().int().positive().max(20).optional(), hasRoommates: z.boolean().optional(),
  rentalReadiness: z.object({ hasOfferLetter: z.boolean().optional(), needsGuarantor: z.boolean().optional(), hasProofOfIncome: z.boolean().optional() }).optional(),
  completionStatus: z.enum(["incomplete", "complete", "confirmed"]), notes: z.string().max(5000).nullable().optional(), createdAt: z.string().max(80), updatedAt: z.string().max(80),
  intent: z.enum(["rent", "buy"]).nullable().optional(), propertyType: z.enum(["apartment", "house", "condo", "room", "unknown"]).nullable().optional(),
  locations: z.array(z.string().max(160)).max(30), bedroomsPreferred: z.number().int().nonnegative().max(20).nullable().optional(), bedroomsFlexible: z.array(z.string().max(80)).max(20),
  moveInTimeframe: z.string().max(120).nullable().optional(), petsRequired: z.boolean().nullable().optional(), parkingRequired: z.boolean().nullable().optional(), laundryRequired: z.boolean().nullable().optional(),
});

const messageSchema = z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string().max(4000), authorName: z.string().max(160).nullable().optional() });
const requestSchema = z.object({ profile: profileSchema, message: z.string().trim().min(1).max(4000).optional(), messages: z.array(messageSchema).max(40).optional() });

function normalizedProfile(input: z.infer<typeof profileSchema>, user: { displayName: string; email: string }): SearchProfileData {
  return {
    ...createOnboardingDraftProfile({ name: input.name || user.displayName, email: input.email || user.email }),
    ...input,
    id: input.id || "onboarding-draft",
    boardId: input.boardId || "onboarding-draft",
    name: input.name || user.displayName,
    email: input.email || user.email,
  };
}

export async function POST(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid onboarding details." }, { status: 400 });
    const profile = normalizedProfile(parsed.data.profile, user);

    if (!parsed.data.message) {
      const confirmed = finalizeProfileState(profile, "confirmed");
      const boardId = await createBoardAndReturnId({
        title: confirmed.city ? `${confirmed.city} shared search` : "Shared rental search",
        userId: user.id,
        authorName: user.displayName,
        profileSeed: confirmed,
        initialAssistantMessage: "The shared brief is ready. Invite your group and start adding real listings.",
      });
      const data = await getBoardPageData(boardId, user.id, {
        includeSuggestedListings: false,
        includeCommutes: false,
      });
      if (!data) return NextResponse.json({ error: "Unable to open the new board." }, { status: 500 });
      return NextResponse.json({ boardId, board: buildMobileBoardPayload(data), profile: data.profile, missingFields: data.missingFields });
    }

    const messages: ChatMessage[] = (parsed.data.messages ?? []).map((message, index) => ({
      id: `onboarding-${index}`, boardId: "onboarding-draft", role: message.role, authorUserId: null,
      authorName: message.authorName ?? null, content: message.content, createdAt: new Date().toISOString(),
    }));
    const hint = getConversationHint(messages);
    const next = finalizeProfileState(applyMessageToProfile(profile, parsed.data.message, hint));
    const reply = generateAssistantReply(profile, next, parsed.data.message, 0, hint);
    return NextResponse.json({
      profile: next,
      assistantMessage: { id: `assistant-${Date.now()}`, role: "assistant", authorName: "Homeboard", content: reply, createdAt: new Date().toISOString() },
      completion: getProfileCompletion(next),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to continue onboarding.";
    return NextResponse.json({ error: message }, { status: message === "MOBILE_AUTH_REQUIRED" ? 401 : 500 });
  }
}
