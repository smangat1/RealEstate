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
  clearRecentlyDeletedBoardListings,
  completeJoinedMemberSetup,
  confirmBoardProfileForUser,
  createBoardAndReturnId,
  createBoardInvitation,
  deleteBoardForUser,
  getBoardPageData,
  getInvitationByCode,
  leaveBoard,
  getUserById,
  moveBoardListingToRecentlyDeleted,
  restoreRecentlyDeletedBoardListing,
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
import { readFormIdentifier, readFormText, safeRelativePath } from "@/lib/input-safety";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithMessage(path: string, key: "error" | "notice", message: string): never {
  const search = new URLSearchParams();
  search.set(key, message);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${search.toString()}`);
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

  const email = readFormText(formData, "email", 254).toLowerCase();
  const passwordValue = formData.get("password");
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const displayName = readFormText(formData, "displayName", 160);
  const next = safeRelativePath(formData.get("next"));
  const registerPath = `/register?next=${encodeURIComponent(next)}${email ? `&email=${encodeURIComponent(email)}` : ""}`;

  if (!email || !password || !displayName) {
    redirectWithMessage(registerPath, "error", "Name, email, and password are required.");
  }
  if (password.length < 8 || password.length > 128) {
    redirectWithMessage(registerPath, "error", "Use a password between 8 and 128 characters.");
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
    redirectWithMessage(registerPath, "error", "Unable to create that account. Check your details or try signing in.");
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
  const email = readFormText(formData, "email", 254).toLowerCase();
  const passwordValue = formData.get("password");
  const password = typeof passwordValue === "string" ? passwordValue : "";
  const next = safeRelativePath(formData.get("next"));
  const signInPath = `/sign-in?next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`;

  if (!email || !password) {
    redirectWithMessage(signInPath, "error", "Email and password are required.");
  }
  if (password.length > 128) {
    redirectWithMessage(signInPath, "error", "Unable to sign in with those credentials.");
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
    redirectWithMessage(signInPath, "error", "Unable to sign in with those credentials.");
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

  const initialPrompt = readFormText(formData, "initialPrompt", 2_000, { multiline: true });
  const titleInput = readFormText(formData, "title", 160);
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
  const boardId = readFormIdentifier(formData, "boardId");
  const redirectTo = safeRelativePath(formData.get("redirectTo"));

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
  const boardId = readFormIdentifier(formData, "boardId");
  const content = readFormText(formData, "content", 4_000, { multiline: true });
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
  const boardId = readFormIdentifier(formData, "boardId");
  const rawMethod = readFormText(formData, "method", 20);
  const method = (["pasted_link", "pasted_text", "manual"] as const).includes(
    rawMethod as "pasted_link" | "pasted_text" | "manual",
  ) ? rawMethod as "pasted_link" | "pasted_text" | "manual" : "manual";
  const currentUser = await getCurrentAppUser();
  if (!boardId || !currentUser) return;

  const boardData = await getBoardPageData(boardId, currentUser.id, {
    includeCommutes: false,
  });
  if (!boardData) return;

  try {
    assertThrottle({
      scope: "web-listing-create",
      key: `${currentUser.id}:${boardId}`,
      limit: 60,
      windowMs: 60 * 60 * 1_000,
      message: "Too many listings were added recently. Please wait before trying again.",
    });
    await addListingToBoard(boardId, {
      method,
      sourceUrl: readFormText(formData, "sourceUrl", 2_000),
      pastedText: readFormText(formData, "pastedText", 20_000, { multiline: true }),
      address: readFormText(formData, "address", 300),
      unit: readFormText(formData, "unit", 50),
      city: readFormText(formData, "city", 160),
      neighborhood: readFormText(formData, "neighborhood", 160),
      price: readFormText(formData, "price", 40),
      bedrooms: readFormText(formData, "bedrooms", 40),
      bathrooms: readFormText(formData, "bathrooms", 40),
      squareFeet: readFormText(formData, "squareFeet", 40),
      description: readFormText(formData, "description", 10_000, { multiline: true }),
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
  const currentUser = await getCurrentAppUser();
  const boardId = readFormIdentifier(formData, "boardId");
  const boardListingId = readFormIdentifier(formData, "boardListingId");
  const rawStatus = readFormText(formData, "status", 20) || "new";
  const allowedStatuses = ["new", "interested", "maybe", "rejected", "toured", "applied"] as const;

  if (!currentUser || !boardId || !boardListingId || !allowedStatuses.some((value) => value === rawStatus)) return;
  const boardData = await getBoardPageData(boardId, currentUser.id, {
    includeCommutes: false,
  });
  if (!boardData?.boardListings.some((entry) => entry.id === boardListingId)) return;

  await updateBoardListingStatus(
    boardListingId,
    rawStatus as (typeof allowedStatuses)[number],
    currentUser.id,
  );
  revalidatePath(`/boards/${boardId}`);
}

export async function saveSuggestedListingAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = readFormIdentifier(formData, "boardId");
  const listingId = readFormIdentifier(formData, "listingId");
  const rawStatus = readFormText(formData, "status", 20) || "maybe";
  const allowedStatuses = ["new", "interested", "maybe", "rejected", "toured", "applied"] as const;

  if (!currentUser || !boardId || !listingId || !allowedStatuses.some((value) => value === rawStatus)) return;

  await saveSuggestedListingToBoard(
    boardId,
    listingId,
    rawStatus as (typeof allowedStatuses)[number],
    currentUser.id,
  );
  revalidatePath(`/boards/${boardId}`);
}

export async function deleteBoardListingAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = readFormIdentifier(formData, "boardId");
  const boardListingId = readFormIdentifier(formData, "boardListingId");
  if (!currentUser || !boardId || !boardListingId) return;

  const boardData = await getBoardPageData(boardId, currentUser.id, {
    includeCommutes: false,
  });
  if (!boardData?.boardListings.some((entry) => entry.id === boardListingId)) return;

  await moveBoardListingToRecentlyDeleted(boardListingId, currentUser.id);
  revalidatePath(`/boards/${boardId}`);
}

export async function restoreBoardListingAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = readFormIdentifier(formData, "boardId");
  const boardListingId = readFormIdentifier(formData, "boardListingId");
  if (!currentUser || !boardId || !boardListingId) return;

  await restoreRecentlyDeletedBoardListing(boardListingId, currentUser.id);
  revalidatePath(`/boards/${boardId}`);
}

export async function clearRecentlyDeletedBoardListingsAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = readFormIdentifier(formData, "boardId");
  if (!currentUser || !boardId) return;

  await clearRecentlyDeletedBoardListings(boardId, currentUser.id);
  revalidatePath(`/boards/${boardId}`);
}

export async function createBoardInvitationAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = readFormIdentifier(formData, "boardId");
  const redirectTo = safeRelativePath(formData.get("redirectTo"), `/settings?boardId=${boardId}`);
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
  const inviteCode = readFormIdentifier(formData, "inviteCode");
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
  const boardId = readFormIdentifier(formData, "boardId");
  if (!currentUser || !boardId) {
    redirect("/");
  }

  try {
    await completeJoinedMemberSetup(boardId, currentUser.id, {
      workAddress: readFormText(formData, "workAddress", 300),
      budgetMin: readFormText(formData, "budgetMin", 40),
      budgetMax: readFormText(formData, "budgetMax", 40),
      stretchBudget: readFormText(formData, "stretchBudget", 40),
      commuteDestination: readFormText(formData, "commuteDestination", 300),
      maxCommuteMinutes: readFormText(formData, "maxCommuteMinutes", 40),
      preferredNeighborhoods: readFormText(formData, "preferredNeighborhoods", 2_000),
      mustHaves: readFormText(formData, "mustHaves", 2_000),
      dealbreakers: readFormText(formData, "dealbreakers", 2_000),
      notes: readFormText(formData, "notes", 5_000, { multiline: true }),
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
  const invitationId = readFormIdentifier(formData, "invitationId");
  const boardId = readFormIdentifier(formData, "boardId");
  const redirectTo = safeRelativePath(formData.get("redirectTo"), `/settings?boardId=${boardId}`);

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
  const boardId = readFormIdentifier(formData, "boardId");
  const memberUserId = readFormIdentifier(formData, "memberUserId");
  const redirectTo = safeRelativePath(formData.get("redirectTo"), `/settings?boardId=${boardId}`);

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
  const boardId = readFormIdentifier(formData, "boardId");
  const redirectTo = safeRelativePath(formData.get("redirectTo"));

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
    displayName: readFormText(formData, "displayName", 160),
    workAddress: readFormText(formData, "workAddress", 300),
    secondaryWorkAddress: readFormText(formData, "secondaryWorkAddress", 300),
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
  const boardId = readFormIdentifier(formData, "boardId");
  if (!currentUser || !boardId) {
    redirect("/");
  }

  try {
    await updateBoardMetadataForUser(boardId, currentUser.id, {
      title: readFormText(formData, "title", 160),
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
  const boardId = readFormIdentifier(formData, "boardId");
  if (!currentUser || !boardId) {
    redirect("/");
  }

  await updateBoardProfileForUser(boardId, currentUser.id, {
    name: readFormText(formData, "name", 160),
    city: readFormText(formData, "city", 160),
    moveInDate: readFormText(formData, "moveInDate", 120),
    budgetMin: parseOptionalNumber(formData.get("budgetMin")) ?? null,
    budgetMax: parseOptionalNumber(formData.get("budgetMax")) ?? null,
    stretchBudget: parseOptionalNumber(formData.get("stretchBudget")) ?? null,
    groupSize: parseOptionalNumber(formData.get("groupSize")) ?? null,
    hasRoommates: parseOptionalBoolean(formData.get("hasRoommates")) ?? null,
    commuteTarget: readFormText(formData, "commuteTarget", 300),
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
  const boardId = readFormIdentifier(formData, "boardId");
  if (!currentUser || !boardId) {
    redirect("/");
  }

  try {
    await updateLinkedMemberProfile(boardId, currentUser.id, {
      workAddress: readFormText(formData, "workAddress", 300),
      budgetMin: readFormText(formData, "budgetMin", 40),
      budgetMax: readFormText(formData, "budgetMax", 40),
      stretchBudget: readFormText(formData, "stretchBudget", 40),
      commuteDestination: readFormText(formData, "commuteDestination", 300),
      maxCommuteMinutes: readFormText(formData, "maxCommuteMinutes", 40),
      preferredNeighborhoods: readFormText(formData, "preferredNeighborhoods", 2_000),
      mustHaves: readFormText(formData, "mustHaves", 2_000),
      dealbreakers: readFormText(formData, "dealbreakers", 2_000),
      notes: readFormText(formData, "notes", 5_000, { multiline: true }),
      commutePriority: readFormText(formData, "commutePriority", 40),
      neighborhoodPriority: readFormText(formData, "neighborhoodPriority", 40),
      spacePriority: readFormText(formData, "spacePriority", 40),
      privacyPriority: readFormText(formData, "privacyPriority", 40),
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
  const boardId = readFormIdentifier(formData, "boardId");
  if (!currentUser || !boardId) {
    redirect("/");
  }

  await confirmBoardProfileForUser(boardId, currentUser.id);
  revalidatePath(`/settings?boardId=${boardId}`);
  revalidatePath(`/boards/${boardId}`);
}

export async function saveListingVoteAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = readFormIdentifier(formData, "boardId");
  const boardListingId = readFormIdentifier(formData, "boardListingId");
  const rawVote = readFormText(formData, "vote", 20) || "maybe";
  const allowedVotes = ["love", "like", "maybe", "pass", "veto"] as const;
  if (!currentUser || !boardId || !boardListingId || !allowedVotes.some((value) => value === rawVote)) return;

  const boardData = await getBoardPageData(boardId, currentUser.id, {
    includeCommutes: false,
  });
  const roommate = boardData?.roommates.find((entry) => entry.linkedUserId === currentUser.id);
  if (!roommate || !boardData?.boardListings.some((entry) => entry.id === boardListingId)) return;

  await saveBoardListingVote(
    boardListingId,
    roommate.id,
    rawVote as (typeof allowedVotes)[number],
    readFormText(formData, "note", 1_000, { multiline: true }),
  );
  revalidatePath(`/boards/${boardId}`);
}

export async function addListingCommentAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const boardId = readFormIdentifier(formData, "boardId");
  const boardListingId = readFormIdentifier(formData, "boardListingId");
  const content = readFormText(formData, "content", 2_000, { multiline: true });
  if (!currentUser || !boardId || !boardListingId || !content) return;

  const boardData = await getBoardPageData(boardId, currentUser.id, {
    includeCommutes: false,
  });
  const roommate = boardData?.roommates.find((entry) => entry.linkedUserId === currentUser.id);
  if (!roommate || !boardData?.boardListings.some((entry) => entry.id === boardListingId)) return;

  await addBoardListingComment(boardListingId, roommate.id, content);
  revalidatePath(`/boards/${boardId}`);
}
