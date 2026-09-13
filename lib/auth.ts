import "server-only";

import type { User } from "@prisma/client";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";

import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthUserRecord } from "@/lib/types";

function mapUser(row: {
  id: string;
  authUserId: string | null;
  email: string | null;
  displayName: string;
  workAddress: string | null;
  secondaryWorkAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}, authState?: {
  emailConfirmedAt?: string | null;
  lastSignInAt?: string | null;
  authProviders?: string[];
}): AuthUserRecord {
  return {
    id: row.id,
    authUserId: row.authUserId ?? "",
    email: row.email ?? "",
    displayName: row.displayName,
    workAddress: row.workAddress,
    secondaryWorkAddress: row.secondaryWorkAddress,
    emailConfirmedAt: authState?.emailConfirmedAt ?? null,
    lastSignInAt: authState?.lastSignInAt ?? null,
    authProviders: authState?.authProviders ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function deriveDisplayName(authUser: SupabaseAuthUser) {
  const metadataName = typeof authUser.user_metadata?.displayName === "string" ? authUser.user_metadata.displayName.trim() : "";
  if (metadataName) return metadataName;
  const emailName = authUser.email?.split("@")[0]?.trim();
  return emailName || "Board member";
}

function deriveWorkAddress(authUser: SupabaseAuthUser) {
  const value = authUser.user_metadata?.workAddress;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deriveSecondaryWorkAddress(authUser: SupabaseAuthUser) {
  const value = authUser.user_metadata?.secondaryWorkAddress;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function metadataBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function metadataNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metadataString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function syncAuthUserToProfile(authUser: SupabaseAuthUser) {
  if (!authUser.email || authUser.app_metadata?.homeboard_deletion_pending === true) return null;
  const email = authUser.email.trim().toLowerCase();
  const profileData = {
    email,
    displayName: deriveDisplayName(authUser),
    workAddress: deriveWorkAddress(authUser),
    secondaryWorkAddress: deriveSecondaryWorkAddress(authUser),
  };

  // Supabase owns provider linking. Homeboard first follows its stable auth ID,
  // then safely adopts an older email-only application row when Supabase has
  // verified that email. This keeps Apple and email entry mapped to one app
  // user without ever reassigning a row already bound to another auth user.
  const existingByAuthID = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
  });
  let row: User;
  if (existingByAuthID) {
    row = await prisma.user.update({
      where: { id: existingByAuthID.id },
      data: profileData,
    });
  } else {
    const existingByEmail = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (existingByEmail?.authUserId && existingByEmail.authUserId !== authUser.id) {
      throw new Error("AUTH_IDENTITY_CONFLICT");
    }
    if (existingByEmail && !authUser.email_confirmed_at) {
      throw new Error("AUTH_IDENTITY_REQUIRES_VERIFIED_EMAIL");
    }
    row = existingByEmail
      ? await prisma.user.update({
          where: { id: existingByEmail.id },
          data: { ...profileData, authUserId: authUser.id },
        })
      : await prisma.user.create({
          data: { ...profileData, authUserId: authUser.id },
        });
  }

  const identities = Array.isArray(authUser.identities) ? authUser.identities : [];
  const authProviders = Array.from(
    new Set(
      identities
        .map((identity) => identity.provider)
        .filter((provider): provider is string => typeof provider === "string" && provider.trim().length > 0),
    ),
  );

  return mapUser(row, {
    emailConfirmedAt: authUser.email_confirmed_at ?? null,
    lastSignInAt: authUser.last_sign_in_at ?? null,
    authProviders,
  });
}

export async function getCurrentAuthUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export function getOnboardingSeedFromAuthUser(authUser: SupabaseAuthUser) {
  return {
    name: deriveDisplayName(authUser),
    email: authUser.email ?? undefined,
    city: metadataString(authUser.user_metadata?.city),
    moveInDate: metadataString(authUser.user_metadata?.moveInDate),
    moveInTimeframe: metadataString(authUser.user_metadata?.moveInDate) ?? null,
    budgetMin: metadataNumber(authUser.user_metadata?.budgetMin),
    budgetMax: metadataNumber(authUser.user_metadata?.budgetMax),
    stretchBudget: metadataNumber(authUser.user_metadata?.stretchBudget),
    neighborhoods: metadataStringArray(authUser.user_metadata?.neighborhoods),
    locations: metadataString(authUser.user_metadata?.city) ? [String(authUser.user_metadata?.city).trim()] : [],
    commuteTarget: metadataString(authUser.user_metadata?.commuteTarget),
    minCommuteMinutes: metadataNumber(authUser.user_metadata?.minCommuteMinutes),
    maxCommuteMinutes: metadataNumber(authUser.user_metadata?.maxCommuteMinutes),
    mustHaves: metadataStringArray(authUser.user_metadata?.mustHaves),
    dealbreakers: metadataStringArray(authUser.user_metadata?.dealbreakers),
    niceToHaves: metadataStringArray(authUser.user_metadata?.niceToHaves),
    priorities: metadataStringArray(authUser.user_metadata?.priorities),
    pets: metadataBoolean(authUser.user_metadata?.pets),
    parking: metadataBoolean(authUser.user_metadata?.parking),
    petsRequired: metadataBoolean(authUser.user_metadata?.pets),
    parkingRequired: metadataBoolean(authUser.user_metadata?.parking),
    groupSize: metadataNumber(authUser.user_metadata?.groupSize),
    hasRoommates: metadataBoolean(authUser.user_metadata?.hasRoommates),
    rentalReadiness:
      typeof authUser.user_metadata?.rentalReadiness === "object" && authUser.user_metadata?.rentalReadiness
        ? {
            hasOfferLetter: metadataBoolean((authUser.user_metadata.rentalReadiness as Record<string, unknown>).hasOfferLetter),
            needsGuarantor: metadataBoolean((authUser.user_metadata.rentalReadiness as Record<string, unknown>).needsGuarantor),
            hasProofOfIncome: metadataBoolean((authUser.user_metadata.rentalReadiness as Record<string, unknown>).hasProofOfIncome),
          }
        : {},
    completionStatus: "incomplete" as const,
  };
}

export async function getCurrentAppUser() {
  const authUser = await getCurrentAuthUser();
  if (!authUser) return null;
  return syncAuthUserToProfile(authUser);
}

export async function requireCurrentAppUser() {
  const user = await getCurrentAppUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  return user;
}
