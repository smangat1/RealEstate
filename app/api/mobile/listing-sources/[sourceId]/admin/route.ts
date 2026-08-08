import { NextResponse } from "next/server";
import { z } from "zod";

import { adminReviewCatalogSource } from "@/lib/catalog-listing-sources";
import { requireMobileAppUser } from "@/lib/mobile-auth";

const schema = z.object({
  decision: z.enum(["verified", "rejected"]),
  note: z.string().trim().max(2_000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ sourceId: string }> },
) {
  try {
    const user = await requireMobileAppUser(request);
    const { sourceId } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose a valid review decision." }, { status: 400 });
    }
    const source = await adminReviewCatalogSource({
      catalogSourceId: sourceId,
      adminUserId: user.id,
      adminEmail: user.email,
      decision: parsed.data.decision,
      note: parsed.data.note,
    });
    return NextResponse.json({ source });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to review the listing source.";
    const status =
      message === "MOBILE_AUTH_REQUIRED" ? 401
      : message === "ADMIN_REQUIRED" ? 403
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
