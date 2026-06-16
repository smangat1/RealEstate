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
