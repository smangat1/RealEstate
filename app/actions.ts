"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { getCurrentAppUser, getCurrentAuthUser, getOnboardingSeedFromAuthUser, syncAuthUserToProfile } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import { notifyBoardChat } from "@/lib/apns";
import {
  acceptBoardInvitation,
  addBoardListingComment,
  addListingToBoard,
  completeJoinedMemberSetup,
  confirmBoardProfileForUser,
  createBoardAndReturnId,
  createBoardInvitation,
  deleteBoardForUser,
  getInvitationByCode,
  leaveBoard,
  getUserById,
  revokeBoardInvitation,
  removeBoardMember,
  saveBoardListingVote,
  saveSuggestedListingToBoard,
  sendChat,
  updateBoardProfileForUser,
  updateBoardListingStatus,
  updateBoardMetadataForUser,
  updateLinkedMemberProfile,
  updateUserProfile,
} from "@/lib/board-data";
import { trackEvent } from "@/lib/analytics";
import { assertThrottle } from "@/lib/action-throttle";
import { sendOperationalAlert } from "@/lib/monitoring";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithMessage(path: string, key: "error" | "notice", message: string): never {
  const search = new URLSearchParams();
  search.set(key, message);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${search.toString()}`);
}

function getSafeNextPath(nextValue: string) {
  if (!nextValue.startsWith("/")) return "/";
  if (nextValue.startsWith("//")) return "/";
  return nextValue;
}

function getInviteCodeFromNextPath(nextPath: string) {
  const match = /^\/invite\/([^/?#]+)$/.exec(nextPath);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const normalized = raw.replace(/\$/g, "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringList(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalBoolean(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

export async function signUpAction(formData: FormData) {
  if (!isAppEnabled()) {
    redirectWithMessage("/", "notice", "Homeboard is currently disabled.");
  }

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const displayName = String(formData.get("displayName") || "").trim();
  const next = getSafeNextPath(String(formData.get("next") || "/"));
  const registerPath = `/register?next=${encodeURIComponent(next)}${email ? `&email=${encodeURIComponent(email)}` : ""}`;

  if (!email || !password || !displayName) {
    redirectWithMessage(registerPath, "error", "Name, email, and password are required.");
  }

  const inviteCode = getInviteCodeFromNextPath(next);
  if (!inviteCode) {
    redirectWithMessage(registerPath, "error", "Homeboard beta accounts require an active board invite.");
  }

  const inviteData = await getInvitationByCode(inviteCode);
  if (!inviteData || inviteData.wasExpired || inviteData.invitation.status !== "pending") {
    redirectWithMessage(registerPath, "error", "This board invite is no longer active. Ask the board owner for a new one.");
  }

  try {
    assertThrottle({
      scope: "sign-up",
      key: email,
      limit: 4,
      windowMs: 1000 * 60 * 10,
      message: "Too many sign-up attempts for this email. Please wait a few minutes and try again.",
    });
  } catch (error) {
    redirectWithMessage(registerPath, "error", error instanceof Error ? error.message : "Too many sign-up attempts.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        displayName,
      },
      emailRedirectTo: undefined,
    },
  });

  if (error) {
    redirectWithMessage(registerPath, "error", error.message);
  }

  await trackEvent("sign_up_completed", {
    email,
    hasInviteContext: next.startsWith("/invite/"),
  });

  await supabase.auth.signOut();
  redirectWithMessage(`/sign-in?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`, "notice", `Account created for ${displayName}. Verify your email if required, then sign in to continue.`);
}

export async function signInAction(formData: FormData) {
  if (!isAppEnabled()) {
    redirectWithMessage("/", "notice", "Homeboard is currently disabled.");
  }
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const next = getSafeNextPath(String(formData.get("next") || "/"));
  const signInPath = `/sign-in?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`;

  if (!email || !password) {
    redirectWithMessage(signInPath, "error", "Email and password are required.");
  }

  try {
    assertThrottle({
      scope: "sign-in",
      key: email,
      limit: 8,
      windowMs: 1000 * 60 * 10,
      message: "Too many sign-in attempts for this email. Please wait a few minutes and try again.",
    });
  } catch (error) {
    redirectWithMessage(signInPath, "error", error instanceof Error ? error.message : "Too many sign-in attempts.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirectWithMessage(signInPath, "error", error?.message || "Unable to sign in.");
  }

  const authUser = data.user;
  if (!authUser) {
    redirectWithMessage(signInPath, "error", "Unable to sign in.");
  }

  await syncAuthUserToProfile(authUser);
  await trackEvent("sign_in_completed", {
    userId: authUser.id,
    email,
    hasInviteContext: next.startsWith("/invite/"),
  });
  redirect(next);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function createBoardAction(formData: FormData) {
  if (!isAppEnabled()) {
    redirectWithMessage("/", "notice", "Board creation is currently disabled.");
  }
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    redirect("/");
  }
  const authUser = await getCurrentAuthUser();

  const initialPrompt = String(formData.get("initialPrompt") || "").trim();
  const titleInput = String(formData.get("title") || "").trim();
  const title =
    titleInput || (initialPrompt ? `${initialPrompt.slice(0, 42)}${initialPrompt.length > 42 ? "..." : ""}` : "New workspace");
  await trackEvent("onboarding_started", {
    userId: currentUser.id,
    initialPrompt,
  });
  const boardId = await createBoardAndReturnId({
    title,
    userId: currentUser.id,
    authorName: currentUser.displayName,
    profileSeed: authUser ? getOnboardingSeedFromAuthUser(authUser) : undefined,
  });
  if (initialPrompt) {
    await sendChat(boardId, initialPrompt, { userId: currentUser.id, authorName: currentUser.displayName });
  }
  redirect(`/boards/${boardId}`);
}

export async function deleteBoardAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  const redirectTo = getSafeNextPath(String(formData.get("redirectTo") || "/"));

  if (!currentUser || !boardId) {
    redirect("/");
  }

  await deleteBoardForUser(boardId, currentUser.id);
  await trackEvent("workspace_deleted", {
    boardId,
    userId: currentUser.id,
  });
  revalidatePath("/");
  redirect(redirectTo);
}

export async function sendChatAction(formData: FormData) {
  if (!isAppEnabled()) return;
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  const content = String(formData.get("content") || "").trim();
  if (!currentUser || !boardId || !content) return;

  try {
    assertThrottle({
      scope: "workspace-chat",
      key: `${currentUser.id}:${boardId}`,
      limit: 12,
      windowMs: 1000 * 60,
      message: "You are sending messages too quickly. Give the workspace a moment and try again.",
    });
  } catch {
    revalidatePath(`/boards/${boardId}`);
    redirect(`/boards/${boardId}?error=${encodeURIComponent("You are sending messages too quickly. Give the workspace a moment and try again.")}`);
  }

  await sendChat(boardId, content, { userId: currentUser.id, authorName: currentUser.displayName });
  after(async () => {
    try {
      await notifyBoardChat({
        boardId,
        authorUserId: currentUser.id,
        authorName: currentUser.displayName,
        content,
      });
    } catch (error) {
      await sendOperationalAlert(error, {
        area: "push",
        operation: "notify_web_board_chat",
        severity: "error",
      });
    }
  });
  revalidatePath(`/boards/${boardId}`);
}

export async function addListingAction(formData: FormData) {
  const boardId = String(formData.get("boardId") || "");
  const method = String(formData.get("method") || "manual") as "pasted_link" | "pasted_text" | "manual";
  const currentUser = await getCurrentAppUser();
  if (!boardId || !currentUser) return;

  try {
    await addListingToBoard(boardId, {
      method,
      sourceUrl: String(formData.get("sourceUrl") || ""),
      pastedText: String(formData.get("pastedText") || ""),
      address: String(formData.get("address") || ""),
      unit: String(formData.get("unit") || ""),
      city: String(formData.get("city") || ""),
      neighborhood: String(formData.get("neighborhood") || ""),
      price: String(formData.get("price") || ""),
      bedrooms: String(formData.get("bedrooms") || ""),
      bathrooms: String(formData.get("bathrooms") || ""),
      squareFeet: String(formData.get("squareFeet") || ""),
      description: String(formData.get("description") || ""),
      actorUserId: currentUser.id,
    });
  } catch (error) {
    redirectWithMessage(
      `/boards/${boardId}`,
      "error",
      error instanceof Error ? error.message : "Unable to import that listing link.",
    );
  }

  revalidatePath(`/boards/${boardId}`);
  redirectWithMessage(`/boards/${boardId}`, "notice", "Listing link imported to Homeboard.");
}

export async function updateListingStatusAction(formData: FormData) {
  const boardId = String(formData.get("boardId") || "");
  const boardListingId = String(formData.get("boardListingId") || "");
  const status = String(formData.get("status") || "new") as
    | "new"
    | "interested"
    | "maybe"
    | "rejected"
    | "toured"
    | "applied";

  if (!boardId || !boardListingId) return;

  await updateBoardListingStatus(boardListingId, status);
  revalidatePath(`/boards/${boardId}`);
}

export async function saveSuggestedListingAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  const listingId = String(formData.get("listingId") || "");
  const status = String(formData.get("status") || "maybe") as
    | "new"
    | "interested"
    | "maybe"
    | "rejected"
    | "toured"
    | "applied";

  if (!currentUser || !boardId || !listingId) return;

  await saveSuggestedListingToBoard(boardId, listingId, status, currentUser.id);
  revalidatePath(`/boards/${boardId}`);
}

export async function createBoardInvitationAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  const redirectTo = getSafeNextPath(String(formData.get("redirectTo") || `/settings?boardId=${boardId}`));
  if (!currentUser || !boardId) {
    redirectWithMessage(redirectTo, "error", "A workspace is required to create an invite.");
  }

  try {
    assertThrottle({
      scope: "workspace-invite",
      key: `${currentUser.id}:${boardId}`,
      limit: 10,
      windowMs: 1000 * 60 * 10,
      message: "Too many invite attempts in a short window. Please wait a few minutes and try again.",
    });
  } catch (error) {
    redirectWithMessage(redirectTo, "error", error instanceof Error ? error.message : "Too many invite attempts.");
  }

  try {
    await createBoardInvitation(boardId, currentUser.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create that invite.";
    redirectWithMessage(redirectTo, "error", message);
  }

  revalidatePath(`/settings?boardId=${boardId}`);
  revalidatePath(`/boards/${boardId}`);
  redirectWithMessage(
    redirectTo,
    "notice",
    "Single-use roommate link created. Share it with the person joining this board.",
  );
}

export async function acceptBoardInvitationAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const inviteCode = String(formData.get("inviteCode") || "");
  if (!currentUser || !inviteCode) {
    redirect("/");
  }

  let boardId: string;
  try {
    boardId = await acceptBoardInvitation(inviteCode, currentUser.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to accept this invite.";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/boards/${boardId}`);
  revalidatePath(`/settings?boardId=${boardId}`);
  redirect(`/boards/${boardId}?memberSetup=1&notice=${encodeURIComponent("You joined the workspace. Add your commute and preference details so the group can use your data right away.")}`);
}

export async function completeJoinedMemberSetupAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  if (!currentUser || !boardId) {
    redirect("/");
  }

  try {
    await completeJoinedMemberSetup(boardId, currentUser.id, {
      workAddress: String(formData.get("workAddress") || ""),
      budgetMin: String(formData.get("budgetMin") || ""),
      budgetMax: String(formData.get("budgetMax") || ""),
      stretchBudget: String(formData.get("stretchBudget") || ""),
      commuteDestination: String(formData.get("commuteDestination") || ""),
      maxCommuteMinutes: String(formData.get("maxCommuteMinutes") || ""),
      preferredNeighborhoods: String(formData.get("preferredNeighborhoods") || ""),
      mustHaves: String(formData.get("mustHaves") || ""),
      dealbreakers: String(formData.get("dealbreakers") || ""),
      notes: String(formData.get("notes") || ""),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save your member setup.";
    redirect(`/boards/${boardId}?memberSetup=1&error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/boards/${boardId}`);
  revalidatePath(`/settings?boardId=${boardId}`);
  redirect(`/boards/${boardId}?notice=${encodeURIComponent("Your member setup is saved. The workspace can now use your commute and preference data.")}`);
}

export async function revokeBoardInvitationAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const invitationId = String(formData.get("invitationId") || "");
  const boardId = String(formData.get("boardId") || "");
  const redirectTo = getSafeNextPath(String(formData.get("redirectTo") || `/settings?boardId=${boardId}`));

  if (!currentUser || !invitationId || !boardId) {
    redirectWithMessage(redirectTo, "error", "Unable to revoke that invite.");
  }

  try {
    await revokeBoardInvitation(invitationId, currentUser.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to revoke that invite.";
    redirectWithMessage(redirectTo, "error", message);
  }

  revalidatePath(`/settings?boardId=${boardId}`);
  revalidatePath(`/boards/${boardId}`);
  redirectWithMessage(redirectTo, "notice", "Invite revoked.");
}

export async function removeBoardMemberAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  const memberUserId = String(formData.get("memberUserId") || "");
  const redirectTo = getSafeNextPath(String(formData.get("redirectTo") || `/settings?boardId=${boardId}`));

  if (!currentUser || !boardId || !memberUserId) {
    redirectWithMessage(redirectTo, "error", "Missing collaborator details.");
  }

  try {
    await removeBoardMember(boardId, currentUser.id, memberUserId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to remove that collaborator.";
    redirectWithMessage(redirectTo, "error", message);
  }

  revalidatePath(`/settings?boardId=${boardId}`);
  revalidatePath(`/boards/${boardId}`);
  redirectWithMessage(redirectTo, "notice", "Collaborator removed from the workspace.");
}

export async function leaveBoardAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  const redirectTo = getSafeNextPath(String(formData.get("redirectTo") || "/"));

  if (!currentUser || !boardId) {
    redirectWithMessage(redirectTo, "error", "Missing workspace details.");
  }

  try {
    await leaveBoard(boardId, currentUser.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to leave this workspace.";
    redirectWithMessage(redirectTo, "error", message);
  }

  revalidatePath("/");
  revalidatePath(`/settings?boardId=${boardId}`);
  redirectWithMessage(redirectTo, "notice", "You left the workspace.");
}

export async function updateSettingsAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    redirect("/");
  }

  await updateUserProfile(currentUser.id, {
    displayName: String(formData.get("displayName") || ""),
    workAddress: String(formData.get("workAddress") || ""),
    secondaryWorkAddress: String(formData.get("secondaryWorkAddress") || ""),
  });

  const refreshedUser = await getUserById(currentUser.id);
  if (refreshedUser) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.updateUser({
      data: {
        displayName: refreshedUser.displayName,
        workAddress: refreshedUser.workAddress,
        secondaryWorkAddress: refreshedUser.secondaryWorkAddress,
      },
    });
  }

  revalidatePath("/settings");
  revalidatePath("/");
}

export async function updateBoardMetadataAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  if (!currentUser || !boardId) {
    redirect("/");
  }

  try {
    await updateBoardMetadataForUser(boardId, currentUser.id, {
      title: String(formData.get("title") || ""),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update workspace details.";
    redirect(`/settings?boardId=${boardId}&error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/settings?boardId=${boardId}`);
  revalidatePath(`/boards/${boardId}`);
  redirect(`/settings?boardId=${boardId}&notice=${encodeURIComponent("Workspace details updated.")}`);
}

export async function updateBoardProfileSettingsAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  if (!currentUser || !boardId) {
    redirect("/");
  }

  await updateBoardProfileForUser(boardId, currentUser.id, {
    name: String(formData.get("name") || ""),
    city: String(formData.get("city") || ""),
    moveInDate: String(formData.get("moveInDate") || ""),
    budgetMin: parseOptionalNumber(formData.get("budgetMin")) ?? null,
    budgetMax: parseOptionalNumber(formData.get("budgetMax")) ?? null,
    stretchBudget: parseOptionalNumber(formData.get("stretchBudget")) ?? null,
    groupSize: parseOptionalNumber(formData.get("groupSize")) ?? null,
    hasRoommates: parseOptionalBoolean(formData.get("hasRoommates")) ?? null,
    commuteTarget: String(formData.get("commuteTarget") || ""),
    maxCommuteMinutes: parseOptionalNumber(formData.get("maxCommuteMinutes")) ?? null,
    neighborhoods: parseStringList(formData.get("neighborhoods")),
    mustHaves: parseStringList(formData.get("mustHaves")),
    niceToHaves: parseStringList(formData.get("niceToHaves")),
    dealbreakers: parseStringList(formData.get("dealbreakers")),
    priorities: parseStringList(formData.get("priorities")),
    pets: parseOptionalBoolean(formData.get("pets")) ?? null,
    parking: parseOptionalBoolean(formData.get("parking")) ?? null,
    rentalReadiness: {
      hasOfferLetter: parseOptionalBoolean(formData.get("hasOfferLetter")),
      needsGuarantor: parseOptionalBoolean(formData.get("needsGuarantor")),
      hasProofOfIncome: parseOptionalBoolean(formData.get("hasProofOfIncome")),
    },
  });

  revalidatePath(`/settings?boardId=${boardId}`);
  revalidatePath(`/boards/${boardId}`);
}

export async function updateLinkedMemberProfileAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  if (!currentUser || !boardId) {
    redirect("/");
  }

  try {
    await updateLinkedMemberProfile(boardId, currentUser.id, {
      workAddress: String(formData.get("workAddress") || ""),
      budgetMin: String(formData.get("budgetMin") || ""),
      budgetMax: String(formData.get("budgetMax") || ""),
      stretchBudget: String(formData.get("stretchBudget") || ""),
      commuteDestination: String(formData.get("commuteDestination") || ""),
      maxCommuteMinutes: String(formData.get("maxCommuteMinutes") || ""),
      preferredNeighborhoods: String(formData.get("preferredNeighborhoods") || ""),
      mustHaves: String(formData.get("mustHaves") || ""),
      dealbreakers: String(formData.get("dealbreakers") || ""),
      notes: String(formData.get("notes") || ""),
      commutePriority: String(formData.get("commutePriority") || ""),
      neighborhoodPriority: String(formData.get("neighborhoodPriority") || ""),
      spacePriority: String(formData.get("spacePriority") || ""),
      privacyPriority: String(formData.get("privacyPriority") || ""),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save your collaborator preferences.";
    redirect(`/settings?boardId=${boardId}&error=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/settings?boardId=${boardId}`);
  revalidatePath(`/boards/${boardId}`);
  redirect(`/settings?boardId=${boardId}&notice=${encodeURIComponent("Your collaborator profile is updated.")}`);
}

export async function confirmBoardProfileAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  if (!currentUser || !boardId) {
    redirect("/");
  }

  await confirmBoardProfileForUser(boardId, currentUser.id);
  revalidatePath(`/settings?boardId=${boardId}`);
  revalidatePath(`/boards/${boardId}`);
}

export async function saveListingVoteAction(formData: FormData) {
  const boardId = String(formData.get("boardId") || "");
  const boardListingId = String(formData.get("boardListingId") || "");
  const roommateId = String(formData.get("roommateId") || "");
  const vote = String(formData.get("vote") || "maybe") as "love" | "like" | "maybe" | "pass" | "veto";
  if (!boardId || !boardListingId || !roommateId) return;

  await saveBoardListingVote(boardListingId, roommateId, vote, String(formData.get("note") || ""));
  revalidatePath(`/boards/${boardId}`);
}

export async function addListingCommentAction(formData: FormData) {
  const boardId = String(formData.get("boardId") || "");
  const boardListingId = String(formData.get("boardListingId") || "");
  const roommateId = String(formData.get("roommateId") || "");
  const content = String(formData.get("content") || "");
  if (!boardId || !boardListingId || !roommateId || !content.trim()) return;

  await addBoardListingComment(boardListingId, roommateId, content);
  revalidatePath(`/boards/${boardId}`);
}
