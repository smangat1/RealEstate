import { NextResponse } from "next/server";
import { z } from "zod";

import { assertThrottle } from "@/lib/action-throttle";
import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { createBoardAndReturnId } from "@/lib/board-data";
import { trackOnboardingStarted, runOnboardingTurn } from "@/lib/onboarding-flow";
import { finalizeProfileState } from "@/lib/rental-logic";

const rentalReadinessSchema = z
  .object({
    hasOfferLetter: z.boolean().optional(),
    needsGuarantor: z.boolean().optional(),
    hasProofOfIncome: z.boolean().optional(),
  })
  .partial();

const profileSchema = z.object({
  id: z.string().min(1).max(120),
  boardId: z.string().min(1).max(120),
  name: z.string().max(160),
  email: z.string().email().optional(),
  city: z.string().max(160).optional(),
  moveInDate: z.string().max(120).optional(),
  budgetMin: z.number().finite().nonnegative().optional(),
  budgetMax: z.number().finite().nonnegative().optional(),
  stretchBudget: z.number().finite().nonnegative().optional(),
  neighborhoods: z.array(z.string().max(120)).max(20),
  commuteTarget: z.string().max(160).optional(),
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

const chatMessageSchema = z.object({
  id: z.string().min(1).max(120),
  boardId: z.string().min(1).max(120),
  role: z.enum(["user", "assistant", "system"]),
  authorUserId: z.string().nullable(),
  authorName: z.string().nullable(),
  content: z.string().max(4000),
  createdAt: z.string().max(80),
});

const onboardingTurnSchema = z.object({
  action: z.literal("turn"),
  message: z.string().trim().min(1).max(2000),
  profile: profileSchema,
  messages: z.array(chatMessageSchema).max(40),
});

const onboardingConfirmSchema = z.object({
  action: z.literal("confirm"),
  profile: profileSchema,
});

const onboardingRequestSchema = z.union([onboardingTurnSchema, onboardingConfirmSchema]);

export async function POST(request: Request) {
  if (!isAppEnabled()) {
    return NextResponse.json({ error: "The live onboarding app is currently disabled outside dev mode." }, { status: 403 });
  }
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsedBody = onboardingRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid onboarding payload." }, { status: 400 });
  }
  const body = parsedBody.data;

  if (body.action === "turn") {
    const { message, profile, messages } = body;

    try {
      assertThrottle({
        scope: "onboarding-turn",
        key: currentUser.id,
        limit: 18,
        windowMs: 1000 * 60,
        message: "You are moving through onboarding too quickly. Please wait a moment and try again.",
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Too many onboarding requests." },
        { status: 429 },
      );
    }

    if (!messages.some((entry) => entry.role === "user")) {
      await trackOnboardingStarted({
        userId: currentUser.id,
        message,
      });
    }

    try {
      const result = await runOnboardingTurn({
        profile,
        message,
        messages,
      });

      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to continue onboarding right now." },
        { status: 500 },
      );
    }
  }

  const nextProfile = finalizeProfileState(
    {
      ...body.profile,
      name: body.profile.name || currentUser.displayName,
      email: body.profile.email || currentUser.email,
    },
    "confirmed",
  );

  if (nextProfile.completionStatus !== "confirmed") {
    return NextResponse.json({ error: "Profile is not ready to confirm yet." }, { status: 400 });
  }

  const titleBase =
    nextProfile.city || nextProfile.locations[0]
      ? `${nextProfile.city || nextProfile.locations[0]} workspace`
      : "New workspace";

  try {
    const boardId = await createBoardAndReturnId({
      title: titleBase,
      userId: currentUser.id,
      authorName: currentUser.displayName,
      profileSeed: nextProfile,
      initialAssistantMessage:
        "Your confirmed rental profile is loaded into the workspace now. Ask for matches, refine a tradeoff, or start comparing listings whenever you’re ready.",
    });

    return NextResponse.json({ boardId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the workspace right now." },
      { status: 500 },
    );
  }
}
