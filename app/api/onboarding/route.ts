import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { createBoardAndReturnId } from "@/lib/board-data";
import { trackOnboardingStarted, runOnboardingTurn } from "@/lib/onboarding-flow";
import { finalizeProfileState } from "@/lib/rental-logic";
import type { ChatMessage, SearchProfileData } from "@/lib/types";

export async function POST(request: Request) {
  if (!isAppEnabled()) {
    return NextResponse.json({ error: "The live onboarding app is currently disabled outside dev mode." }, { status: 403 });
  }
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as
    | {
        action: "turn";
        message: string;
        profile: SearchProfileData;
        messages: ChatMessage[];
      }
    | {
        action: "confirm";
        profile: SearchProfileData;
      };

  if (body.action === "turn") {
    const { message, profile, messages } = body;
    if (!message.trim()) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    if (!messages.some((entry) => entry.role === "user")) {
      await trackOnboardingStarted({
        userId: currentUser.id,
        message,
      });
    }

    const result = await runOnboardingTurn({
      profile,
      message,
      messages,
    });

    return NextResponse.json(result);
  }

  const nextProfile = finalizeProfileState({
    ...body.profile,
    name: body.profile.name || currentUser.displayName,
    email: body.profile.email || currentUser.email,
  }, "confirmed");

  if (nextProfile.completionStatus !== "confirmed") {
    return NextResponse.json({ error: "Profile is not ready to confirm yet." }, { status: 400 });
  }

  const titleBase =
    nextProfile.city || nextProfile.locations[0]
      ? `${nextProfile.city || nextProfile.locations[0]} rental board`
      : "New rental search";

  const boardId = await createBoardAndReturnId({
    title: titleBase,
    userId: currentUser.id,
    authorName: currentUser.displayName,
    profileSeed: nextProfile,
    initialAssistantMessage:
      "Your confirmed rental profile is loaded into this board now. Ask for matches, refine a tradeoff, or start comparing listings whenever you’re ready.",
  });

  return NextResponse.json({ boardId });
}
