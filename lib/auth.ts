import "server-only";

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
}): AuthUserRecord {
  return {
    id: row.id,
    authUserId: row.authUserId ?? "",
    email: row.email ?? "",
    displayName: row.displayName,
    workAddress: row.workAddress,
    secondaryWorkAddress: row.secondaryWorkAddress,
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
  if (!authUser.email) return null;

  const row = await prisma.user.upsert({
    where: { authUserId: authUser.id },
    update: {
      email: authUser.email,
      displayName: deriveDisplayName(authUser),
      workAddress: deriveWorkAddress(authUser),
      secondaryWorkAddress: deriveSecondaryWorkAddress(authUser),
    },
    create: {
      authUserId: authUser.id,
      email: authUser.email,
      displayName: deriveDisplayName(authUser),
      workAddress: deriveWorkAddress(authUser),
      secondaryWorkAddress: deriveSecondaryWorkAddress(authUser),
    },
  });

  return mapUser(row);
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
