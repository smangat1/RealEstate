"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentAppUser, syncAuthUserToProfile } from "@/lib/auth";
import {
  acceptBoardInvitation,
  addBoardListingComment,
  addListingToBoard,
  createBoardAndReturnId,
  createBoardInvitation,
  deleteBoardForUser,
  getUserById,
  saveBoardListingVote,
  saveSuggestedListingToBoard,
  sendChat,
  updateBoardListingStatus,
  updateUserProfile,
} from "@/lib/board-data";
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

export async function signUpAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();
  const displayName = String(formData.get("displayName") || "").trim();
  const workAddress = String(formData.get("workAddress") || "").trim();
  const secondaryWorkAddress = String(formData.get("secondaryWorkAddress") || "").trim();
  const next = getSafeNextPath(String(formData.get("next") || "/"));

  if (!email || !password || !displayName) {
    redirectWithMessage("/", "error", "Name, email, and password are required.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        displayName,
        workAddress: workAddress || null,
        secondaryWorkAddress: secondaryWorkAddress || null,
      },
    },
  });

  if (error) {
    redirectWithMessage("/", "error", error.message);
  }

  if (data.user) {
    await syncAuthUserToProfile(data.user);
  }

  if (data.session && data.user) {
    await syncAuthUserToProfile(data.user);
    redirect(next);
  }

  redirectWithMessage("/", "notice", "Account created. If email confirmation is enabled, check your inbox, then sign in.");
}

export async function signInAction(formData: FormData) {
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
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    redirect("/");
  }

  const initialPrompt = String(formData.get("initialPrompt") || "").trim();
  const titleInput = String(formData.get("title") || "").trim();
  const title =
    titleInput || (initialPrompt ? `${initialPrompt.slice(0, 42)}${initialPrompt.length > 42 ? "..." : ""}` : "New rental search");
  const boardId = await createBoardAndReturnId({ title, userId: currentUser.id, authorName: currentUser.displayName });
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
  const token = String(formData.get("token") || "");
  if (!currentUser || !token) {
    redirect("/");
  }

  const boardId = await acceptBoardInvitation(token, currentUser.id);
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
