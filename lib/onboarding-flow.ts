import "server-only";

import { extractSearchProfileUpdatesWithAI, generateConversationalReplyWithAI, mergeProfileUpdates } from "@/lib/chat-ai";
import { isDemoModeEnabled, runDemoChatTurn } from "@/lib/demo-chat";
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
  const recentMessages = [...input.messages.slice(-8), { role: "user", content: input.message, authorName: input.profile.name }];

  let nextProfile = input.profile;
  let assistant = "";

  if (isDemoModeEnabled()) {
    const demoTurn = runDemoChatTurn({
      previousProfile: input.profile,
      message: input.message,
      messages: input.messages,
      listingsCount: 0,
    });
    nextProfile = finalizeProfileState(demoTurn.nextProfile);
    assistant = demoTurn.reply;
  } else {
    const ruleProfile = applyMessageToProfile(input.profile, input.message, conversationHint);
    const aiExtraction = await extractSearchProfileUpdatesWithAI({
      profile: input.profile,
      message: input.message,
      recentMessages,
      conversationHint,
    });

    nextProfile =
      aiExtraction?.updates && Object.keys(aiExtraction.updates).length > 0
        ? mergeProfileUpdates(ruleProfile, aiExtraction.updates)
        : ruleProfile;
    nextProfile = finalizeProfileState(nextProfile);

    const fallbackReply = generateAssistantReply(input.profile, nextProfile, input.message, 0, conversationHint);
    assistant = await generateConversationalReplyWithAI({
      previousProfile: input.profile,
      nextProfile,
      message: input.message,
      recentMessages,
      missingFields: getProfileCompletion(nextProfile).missingFields,
      listingsCount: 0,
      fallbackReply,
    });
  }

  return {
    profile: nextProfile,
    completion: getProfileCompletion(nextProfile),
    assistantMessage: {
      id: `assistant-${Date.now()}`,
      boardId: "onboarding-draft",
      role: "assistant" as const,
      authorUserId: null,
      authorName: "Advisor",
      content: assistant,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function trackOnboardingStarted(payload: { userId?: string; message: string }) {
  await trackEvent("onboarding_started", payload);
}
