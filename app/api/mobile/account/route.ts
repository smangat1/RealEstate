import { NextResponse } from "next/server";
import { z } from "zod";

import {
  deleteAccountApplicationData,
  deleteAccountListingImages,
  prepareAccountDeletion,
} from "@/lib/account-deletion";
import {
  getAppleRevokeConfiguration,
  revokeAppleAuthorizationCode,
} from "@/lib/apple-revoke";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { supabaseAdmin } from "@/lib/supabase/admin";

const schema = z.object({
  appleAuthorizationCode: z.string().trim().min(1).max(4_000).optional(),
});

export async function DELETE(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid deletion request." }, { status: 400 });
    let appleRevoked = false;
    if (user.authProviders.includes("apple") && parsed.data.appleAuthorizationCode) {
      const configuration = getAppleRevokeConfiguration();
      if (!configuration) {
        await sendOperationalAlert(new Error("Apple token revocation is not configured."), {
          area: "mobile_api",
          operation: "revoke_apple_token",
          requestId: request.headers.get("x-homeboard-request-id"),
          severity: "critical",
        });
      } else {
        try {
          await revokeAppleAuthorizationCode({
            ...configuration,
            authorizationCode: parsed.data.appleAuthorizationCode,
          });
          appleRevoked = true;
        } catch {
          await sendOperationalAlert(new Error("Apple token revocation failed."), {
            area: "mobile_api",
            operation: "revoke_apple_token",
            requestId: request.headers.get("x-homeboard-request-id"),
            severity: "critical",
          });
        }
      }
    }
    const plan = await prepareAccountDeletion(user.id);
    let authDeletionMarked = false;
    let applicationDataDeleted = false;
    let previousAuthMetadata: Record<string, unknown> = {};

    try {
      if (user.authUserId) {
        const { data: authIdentity, error: lookupError } = await supabaseAdmin.auth.admin
          .getUserById(user.authUserId);
        if (lookupError && !/not found/i.test(lookupError.message)) throw lookupError;
        previousAuthMetadata = { ...(authIdentity.user?.app_metadata ?? {}) };
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user.authUserId, {
          app_metadata: {
            ...previousAuthMetadata,
            homeboard_deletion_pending: true,
          },
        });
        if (error && !/not found/i.test(error.message)) throw error;
        authDeletionMarked = !error;
      }

      await deleteAccountListingImages(plan);
      await deleteAccountApplicationData(plan);
      applicationDataDeleted = true;

      let authCleanupPending = false;
      if (user.authUserId) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(user.authUserId);
        if (error) {
          authCleanupPending = true;
          await sendOperationalAlert(error, {
            area: "mobile_api",
            operation: "delete_account_auth_cleanup",
            requestId: request.headers.get("x-homeboard-request-id"),
            severity: "critical",
          });
        }
      }

      return NextResponse.json({ ok: true, authCleanupPending, appleRevoked });
    } catch (error) {
      if (user.authUserId && authDeletionMarked && !applicationDataDeleted) {
        const { error: rollbackError } = await supabaseAdmin.auth.admin.updateUserById(
          user.authUserId,
          { app_metadata: previousAuthMetadata },
        );
        if (rollbackError) {
          await sendOperationalAlert(rollbackError, {
            area: "mobile_api",
            operation: "rollback_account_deletion_marker",
            requestId: request.headers.get("x-homeboard-request-id"),
            severity: "critical",
          });
        }
      }
      throw error;
    }
  } catch (error) {
    await sendOperationalAlert(error, {
      area: "mobile_api",
      operation: "delete_account",
      requestId: request.headers.get("x-homeboard-request-id"),
      severity: "critical",
    });
    const message = error instanceof Error ? error.message : "Unable to delete account.";
    const unauthorized = message === "MOBILE_AUTH_REQUIRED";
    return NextResponse.json(
      { error: unauthorized ? "Unauthorized" : "Unable to delete account." },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
