import "server-only";

import {
  applyMessageToProfile,
  createBlankProfile,
  finalizeProfileState,
  getConversationHint,
  getProfileCompletion,
  generateAssistantReply,
} from "@/lib/rental-logic";
import { trackEvent } from "@/lib/analytics";
import type { ChatMessage, SearchProfileData } from "@/lib/types";

export function createOnboardingDraftProfile(input: { name: string; email?: string }) {
  return {
    ...createBlankProfile("onboarding-draft"),
    name: input.name || "Unknown",
    email: input.email,
  };
}

export async function runOnboardingTurn(input: {
  profile: SearchProfileData;
  message: string;
  messages: ChatMessage[];
}) {
  const conversationHint = getConversationHint(input.messages);
  const nextProfile = finalizeProfileState(
    applyMessageToProfile(input.profile, input.message, conversationHint),
  );
  const assistant = generateAssistantReply(
    input.profile,
    nextProfile,
    input.message,
    0,
    conversationHint,
  );

  return {
    profile: nextProfile,
    completion: getProfileCompletion(nextProfile),
    assistantMessage: {
      id: `assistant-${Date.now()}`,
      boardId: "onboarding-draft",
      role: "assistant" as const,
      authorUserId: null,
      authorName: "Homeboard setup",
      content: assistant,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function trackOnboardingStarted(payload: { userId?: string; message: string }) {
  await trackEvent("onboarding_started", payload);
}
