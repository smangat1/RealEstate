import { NextResponse } from "next/server";

import {
  deleteAccountApplicationData,
  deleteAccountListingImages,
  prepareAccountDeletion,
} from "@/lib/account-deletion";
import { requireMobileAppUser } from "@/lib/mobile-auth";
import { sendOperationalAlert } from "@/lib/monitoring";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(request: Request) {
  try {
    const user = await requireMobileAppUser(request);
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

      return NextResponse.json({ ok: true, authCleanupPending });
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
