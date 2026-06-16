"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentAppUser, getCurrentAuthUser, getOnboardingSeedFromAuthUser, syncAuthUserToProfile } from "@/lib/auth";
import { isAppEnabled } from "@/lib/app-mode";
import {
  acceptBoardInvitation,
  addBoardListingComment,
  addListingToBoard,
  confirmBoardProfileForUser,
  createBoardAndReturnId,
  createBoardInvitation,
  deleteBoardForUser,
  getUserById,
  saveBoardListingVote,
  saveSuggestedListingToBoard,
  sendChat,
  updateBoardProfileForUser,
  updateBoardListingStatus,
  updateUserProfile,
} from "@/lib/board-data";
import { trackEvent } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithMessage(path: string, key: "error" | "notice", message: string): never {
  const search = new URLSearchParams();
  search.set(key, message);
  redirect(`${path}?${search.toString()}`);
}

function getSafeNextPath(nextValue: string) {
  if (!nextValue.startsWith("/")) return "/";
  if (nextValue.startsWith("//")) return "/";
  return nextValue;
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
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const displayName = String(formData.get("displayName") || "").trim();
  const next = getSafeNextPath(String(formData.get("next") || "/"));

  if (!email || !password || !displayName) {
    redirectWithMessage("/register", "error", "Name, email, and password are required.");
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
    redirectWithMessage("/register", "error", error.message);
  }

  await supabase.auth.signOut();
  redirectWithMessage("/", "notice", `Account created for ${displayName}. Verify your email if required, then sign in to continue to ${next}.`);
}

export async function signInAction(formData: FormData) {
  if (!isAppEnabled()) {
    redirectWithMessage("/", "notice", "The live Homeboard app is currently gated. You can still join the waitlist and create an account.");
  }
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const next = getSafeNextPath(String(formData.get("next") || "/"));

  if (!email || !password) {
    redirectWithMessage("/", "error", "Email and password are required.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    redirectWithMessage("/", "error", error?.message || "Unable to sign in.");
  }

  const authUser = data.user;
  if (!authUser) {
    redirectWithMessage("/", "error", "Unable to sign in.");
  }

  await syncAuthUserToProfile(authUser);
  redirect(next);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function createBoardAction(formData: FormData) {
  if (!isAppEnabled()) {
    redirectWithMessage("/", "notice", "Board creation is currently gated outside dev mode.");
  }
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    redirect("/");
  }
  const authUser = await getCurrentAuthUser();

  const initialPrompt = String(formData.get("initialPrompt") || "").trim();
  const titleInput = String(formData.get("title") || "").trim();
  const title =
    titleInput || (initialPrompt ? `${initialPrompt.slice(0, 42)}${initialPrompt.length > 42 ? "..." : ""}` : "New rental search");
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
  revalidatePath("/");
  redirect(redirectTo);
}

export async function sendChatAction(formData: FormData) {
  if (!isAppEnabled()) return;
  const currentUser = await getCurrentAppUser();
  const boardId = String(formData.get("boardId") || "");
  const content = String(formData.get("content") || "").trim();
  if (!currentUser || !boardId || !content) return;

  await sendChat(boardId, content, { userId: currentUser.id, authorName: currentUser.displayName });
  revalidatePath(`/boards/${boardId}`);
}

export async function addListingAction(formData: FormData) {
  const boardId = String(formData.get("boardId") || "");
  const method = String(formData.get("method") || "manual") as "pasted_link" | "pasted_text" | "manual";
  if (!boardId) return;

  await addListingToBoard(boardId, {
    method,
    sourceUrl: String(formData.get("sourceUrl") || ""),
    pastedText: String(formData.get("pastedText") || ""),
    address: String(formData.get("address") || ""),
    city: String(formData.get("city") || ""),
    neighborhood: String(formData.get("neighborhood") || ""),
    price: String(formData.get("price") || ""),
    bedrooms: String(formData.get("bedrooms") || ""),
    bathrooms: String(formData.get("bathrooms") || ""),
    squareFeet: String(formData.get("squareFeet") || ""),
    description: String(formData.get("description") || ""),
  });

  revalidatePath(`/boards/${boardId}`);
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
  const email = String(formData.get("email") || "");
  if (!currentUser || !boardId || !email.trim()) return;

  await createBoardInvitation(boardId, currentUser.id, email);
  revalidatePath(`/boards/${boardId}`);
}

export async function acceptBoardInvitationAction(formData: FormData) {
  const currentUser = await getCurrentAppUser();
  const inviteCode = String(formData.get("inviteCode") || "");
  if (!currentUser || !inviteCode) {
    redirect("/");
  }

  const boardId = await acceptBoardInvitation(inviteCode, currentUser.id);
  redirect(`/boards/${boardId}`);
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

export async function submitWaitlistAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const city = String(formData.get("city") || "").trim();
  const moveInTimeline = String(formData.get("moveInTimeline") || "").trim();
  const groupSize = parseOptionalNumber(formData.get("groupSize"));
  const hasRoommates = parseOptionalBoolean(formData.get("hasRoommates"));
  const activelySearching = parseOptionalBoolean(formData.get("activelySearching"));
  const willingToBetaTest = parseOptionalBoolean(formData.get("willingToBetaTest"));
  const willingToInviteRoommates = parseOptionalBoolean(formData.get("willingToInviteRoommates"));
  const biggestFrustration = String(formData.get("biggestFrustration") || "").trim();
  const source = String(formData.get("source") || "landing-page").trim();

  if (!name || !email || !city) {
    redirectWithMessage("/", "error", "Waitlist needs your name, email, and city.");
  }

  await prisma.waitlistSubmission.upsert({
    where: { email },
    update: {
      name,
      city,
      moveInTimeline: moveInTimeline || null,
      groupSize: groupSize ?? null,
      hasRoommates: hasRoommates ?? null,
      activelySearching: activelySearching ?? null,
      willingToBetaTest: willingToBetaTest ?? null,
      willingToInviteRoommates: willingToInviteRoommates ?? null,
      biggestFrustration: biggestFrustration || null,
      source: source || null,
    },
    create: {
      name,
      email,
      city,
      moveInTimeline: moveInTimeline || null,
      groupSize: groupSize ?? null,
      hasRoommates: hasRoommates ?? null,
      activelySearching: activelySearching ?? null,
      willingToBetaTest: willingToBetaTest ?? null,
      willingToInviteRoommates: willingToInviteRoommates ?? null,
      biggestFrustration: biggestFrustration || null,
      source: source || null,
    },
  });

  await trackEvent("waitlist_submitted", {
    email,
    city,
    source,
  });

  redirectWithMessage("/", "notice", "You’re on the waitlist. We’ll reach out when the next Homeboard beta round opens.");
}
